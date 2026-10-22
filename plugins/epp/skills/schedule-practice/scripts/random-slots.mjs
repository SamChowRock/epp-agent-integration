import { randomInt, randomUUID } from 'node:crypto';
import {
  closeSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const interval = 30;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function keys(value, expected) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === expected.toSorted().join(',')
  );
}

function minuteOfDay(value) {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):(?:00|30)$/.test(value))
    throw new Error('配置时间须为 HH:00 或 HH:30，且窗口不能跨日。');
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function validateConfig(value) {
  if (
    !keys(value, ['timezone', 'window', 'dailyCount']) ||
    !keys(value.window, ['start', 'end']) ||
    !keys(value.dailyCount, ['min', 'max'])
  )
    throw new Error('配置只能包含 timezone、window.start/end 和 dailyCount.min/max。');
  if (typeof value.timezone !== 'string') throw new Error('配置 timezone 须为有效时区。');
  try {
    new Intl.DateTimeFormat('en', { timeZone: value.timezone });
  } catch {
    throw new Error('配置 timezone 须为有效时区。');
  }
  const start = minuteOfDay(value.window.start);
  const end = minuteOfDay(value.window.end);
  const { min, max } = value.dailyCount;
  if (
    end <= start ||
    !Number.isInteger(min) ||
    !Number.isInteger(max) ||
    min < 1 ||
    max < min ||
    max > (end - start) / interval
  )
    throw new Error('配置次数须为正整数范围，且不能超过同日窗口内的半小时时段数。');
  return {
    timezone: value.timezone,
    window: { start: value.window.start, end: value.window.end },
    dailyCount: { min, max },
  };
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error(`${label}无法读取为 JSON；保留原文件并修复后重试。`);
  }
}

function localTime(now, timezone) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('日期无效。');
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map(({ type, value }) => [type, value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minute: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function validateState(state) {
  try {
    if (
      !keys(state, ['version', 'date', 'config', 'slots']) ||
      state.version !== 1 ||
      typeof state.date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(state.date)
    )
      throw new Error();
    if (new Date(`${state.date}T00:00:00Z`).toISOString().slice(0, 10) !== state.date)
      throw new Error();
    const config = validateConfig(state.config);
    if (
      !Array.isArray(state.slots) ||
      state.slots.length < config.dailyCount.min ||
      state.slots.length > config.dailyCount.max
    )
      throw new Error();
    let previous = -1;
    const ids = new Set();
    for (const slot of state.slots) {
      if (
        !keys(slot, ['minute', 'id', 'acknowledged']) ||
        !Number.isInteger(slot.minute) ||
        slot.minute < minuteOfDay(config.window.start) ||
        slot.minute >= minuteOfDay(config.window.end) ||
        slot.minute % interval !== 0 ||
        slot.minute <= previous ||
        typeof slot.id !== 'string' ||
        !uuid.test(slot.id) ||
        ids.has(slot.id) ||
        typeof slot.acknowledged !== 'boolean'
      )
        throw new Error();
      previous = slot.minute;
      ids.add(slot.id);
    }
    return { ...state, config };
  } catch {
    throw new Error('状态内容无效；保留原文件，不重新抽取当天计划。');
  }
}

function createPlan(config, date) {
  const available = [];
  for (
    let minute = minuteOfDay(config.window.start);
    minute < minuteOfDay(config.window.end);
    minute += interval
  )
    available.push(minute);
  const count = randomInt(config.dailyCount.min, config.dailyCount.max + 1);
  const selected = [];
  for (let index = 0; index < count; index++)
    selected.push(available.splice(randomInt(available.length), 1)[0]);
  return {
    version: 1,
    date,
    config,
    slots: selected
      .sort((a, b) => a - b)
      .map((minute) => ({
        minute,
        id: randomUUID(),
        acknowledged: false,
      })),
  };
}

function saveState(path, state) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(state, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

export function runSchedule({
  configPath,
  statePath,
  command = 'check',
  reminderId,
  now = new Date(),
}) {
  if (!configPath || !statePath || resolve(configPath) === resolve(statePath))
    throw new Error('配置与状态必须使用不同的文件路径。');
  if (
    !['check', 'ack'].includes(command) ||
    (command === 'ack' ? !reminderId : reminderId !== undefined)
  )
    throw new Error('使用 check 或 ack；仅 ack 需要提醒身份 --id。');
  const config = validateConfig(readJson(configPath, '配置'));
  const { date, minute } = localTime(now, config.timezone);
  const path = resolve(statePath);
  mkdirSync(dirname(path), { recursive: true });
  const lockPath = `${path}.lock`;
  let lock;
  try {
    lock = openSync(lockPath, 'wx', 0o600);
  } catch {
    throw new Error('无法取得状态锁；确认其他运行已结束后再检查 .lock 文件。');
  }
  try {
    const file = lstatSync(path, { throwIfNoEntry: false });
    if (file && !file.isFile()) throw new Error('状态必须是普通文件，不能使用符号链接。');
    let state = file ? validateState(readJson(path, '状态')) : null;
    if (state && state.date > date) throw new Error('日期早于已保存计划；核对时钟与时区。');
    if (state?.date === date && JSON.stringify(state.config) !== JSON.stringify(config))
      throw new Error('当天配置已经锁定；恢复配置或等待下一自然日，不能删除状态重抽。');
    if (!state || state.date !== date) {
      if (command === 'ack') throw new Error('没有当天状态可确认；先执行 check。');
      state = createPlan(config, date);
      saveState(path, state);
    }
    const result = { action: 'quiet', date, timezone: config.timezone };
    if (command === 'ack') {
      const slot = state.slots.find((item) => item.id === reminderId);
      if (!slot) throw new Error('提醒身份不属于当天计划。');
      if (minute < slot.minute) throw new Error('尚未到达该提醒时段。');
      if (!slot.acknowledged) {
        slot.acknowledged = true;
        saveState(path, state);
      }
      return { ...result, action: 'acknowledged', reminderId };
    }
    const slot = state.slots.find(
      (item) => !item.acknowledged && item.minute <= minute && minute < item.minute + interval,
    );
    return slot ? { ...result, action: 'practice', reminderId: slot.id } : result;
  } finally {
    closeSync(lock);
    rmSync(lockPath);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values, positionals } = parseArgs({
      allowPositionals: true,
      options: { config: { type: 'string' }, state: { type: 'string' }, id: { type: 'string' } },
    });
    if (positionals.length !== 1)
      throw new Error('用法：check|ack --config 文件 --state 文件 [--id 提醒身份]');
    console.log(
      JSON.stringify(
        runSchedule({
          command: positionals[0],
          configPath: values.config,
          statePath: values.state,
          reminderId: values.id,
        }),
      ),
    );
  } catch (error) {
    console.error(`随机练习计划失败：${error.message}`);
    process.exitCode = 1;
  }
}
