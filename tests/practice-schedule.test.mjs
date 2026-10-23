import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { runSchedule } from '../plugins/epp/skills/schedule-practice/scripts/random-slots.mjs';

const example = new URL(
  '../plugins/epp/skills/schedule-practice/config.example.json',
  import.meta.url,
);
const script = fileURLToPath(
  new URL('../plugins/epp/skills/schedule-practice/scripts/random-slots.mjs', import.meta.url),
);

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'epp-schedule-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const configPath = join(directory, 'config.json');
  const statePath = join(directory, 'state.json');
  writeFileSync(configPath, readFileSync(example));
  return {
    configPath,
    statePath,
    run(now, command = 'check', reminderId) {
      return runSchedule({ configPath, statePath, command, reminderId, now: new Date(now) });
    },
    state: () => JSON.parse(readFileSync(statePath, 'utf8')),
    configure(change) {
      const config = JSON.parse(readFileSync(example, 'utf8'));
      change(config);
      writeFileSync(configPath, JSON.stringify(config));
    },
  };
}

function at(minute, day = '2026-10-19') {
  return `${day}T${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}:00+08:00`;
}

test('persists three or four distinct random half-hour slots and keeps them across restarts', (t) => {
  const f = fixture(t);
  f.run(at(600));
  const state = f.state();
  assert.equal(state.date, '2026-10-19');
  assert.ok([3, 4].includes(state.slots.length));
  assert.equal(new Set(state.slots.map((slot) => slot.minute)).size, state.slots.length);
  assert.equal(new Set(state.slots.map((slot) => slot.id)).size, state.slots.length);
  assert.deepEqual(
    state.slots.map((slot) => slot.minute),
    state.slots.map((slot) => slot.minute).toSorted((a, b) => a - b),
  );
  for (const slot of state.slots) {
    assert.ok(slot.minute >= 600 && slot.minute < 1260);
    assert.equal(slot.minute % 30, 0);
    assert.equal(slot.acknowledged, false);
    assert.match(slot.id, /^[0-9a-f-]{36}$/);
  }
  f.run(at(600));
  assert.deepEqual(f.state(), state);
});

test('retries a due reminder with the same operation ID until acknowledged, then stays quiet', (t) => {
  const f = fixture(t);
  f.run(at(600));
  for (const slot of f.state().slots) {
    const result = f.run(at(slot.minute));
    assert.equal(result.action, 'practice');
    assert.equal(result.reminderId, slot.id);
    assert.deepEqual(f.run(at(slot.minute + 4)), result);
    assert.equal(f.run(at(slot.minute + 5), 'ack', slot.id).action, 'acknowledged');
    assert.equal(f.run(at(slot.minute + 6)).action, 'quiet');
    assert.equal(f.run(at(slot.minute + 6), 'ack', slot.id).action, 'acknowledged');
  }
});

test('missed slots expire, the window is end-exclusive, and only the Beijing date resets the plan', (t) => {
  const f = fixture(t);
  assert.equal(f.run(at(599)).action, 'quiet');
  const original = f.state();
  const first = original.slots[0];
  const late = f.run(at(first.minute + 30));
  assert.notEqual(late.reminderId, first.id);
  assert.equal(f.run(at(1260)).action, 'quiet');
  assert.equal(f.run('2026-10-19T15:59:00Z').date, '2026-10-19');
  assert.equal(f.run('2026-10-19T16:00:00Z').date, '2026-10-20');
  assert.notDeepEqual(f.state().slots, original.slots);
});

test('supports other configured timezones, windows and fixed daily counts', (t) => {
  const f = fixture(t);
  f.configure((config) => {
    config.timezone = 'America/New_York';
    config.window = { start: '09:30', end: '11:30' };
    config.dailyCount = { min: 4, max: 4 };
  });
  assert.equal(f.run('2026-10-19T13:30:00Z').action, 'practice');
  assert.deepEqual(
    f.state().slots.map((slot) => slot.minute),
    [570, 600, 630, 660],
  );
});

test('rejects malformed configuration without creating or overwriting state', (t) => {
  const changes = [
    (config) => {
      config.timezone = 'not/a-zone';
    },
    (config) => {
      config.window.start = '10:15';
    },
    (config) => {
      config.window.end = '09:00';
    },
    (config) => {
      config.window.start = '24:00';
    },
    (config) => {
      config.dailyCount.min = 0;
    },
    (config) => {
      config.dailyCount.max = 23;
    },
    (config) => {
      config.dailyCount.max = 2;
    },
    (config) => {
      config.dailyCount.min = 3.5;
    },
    (config) => {
      config.dailyCount.extra = true;
    },
    (config) => {
      config.timeZone = config.timezone;
    },
  ];
  for (const change of changes) {
    const f = fixture(t);
    f.configure(change);
    assert.throws(() => f.run(at(600)), /配置/);
    assert.equal(existsSync(f.statePath), false);
  }
});

test('preserves the plan when configuration changes mid-day or the clock goes backwards', (t) => {
  const f = fixture(t);
  f.run(at(600));
  const before = readFileSync(f.statePath, 'utf8');
  f.configure((config) => {
    config.dailyCount.min = 4;
  });
  assert.throws(() => f.run(at(700)), /当天配置/);
  assert.equal(readFileSync(f.statePath, 'utf8'), before);
  assert.throws(() => f.run(at(600, '2026-10-18')), /日期/);
  assert.equal(readFileSync(f.statePath, 'utf8'), before);
  f.run(at(600, '2026-10-20'));
  assert.equal(f.state().slots.length, 4);
});

test('refuses unknown or premature acknowledgements and does not create plans from ack', (t) => {
  const f = fixture(t);
  assert.throws(() => f.run(at(600), 'ack', 'unknown'), /状态/);
  assert.equal(existsSync(f.statePath), false);
  f.run(at(599));
  const before = readFileSync(f.statePath, 'utf8');
  assert.throws(() => f.run(at(599), 'ack', f.state().slots[0].id), /尚未到达/);
  assert.throws(() => f.run(at(1260), 'ack', 'unknown'), /提醒身份/);
  assert.equal(readFileSync(f.statePath, 'utf8'), before);
});

test('refuses corrupted state, conflicting state/config paths, and concurrent ownership', (t) => {
  const f = fixture(t);
  writeFileSync(f.statePath, '{broken');
  assert.throws(() => f.run(at(600)), /状态/);
  assert.equal(readFileSync(f.statePath, 'utf8'), '{broken');
  assert.throws(() => runSchedule({ configPath: f.configPath, statePath: f.configPath }), /路径/);
  rmSync(f.statePath);
  writeFileSync(`${f.statePath}.lock`, 'another process');
  assert.throws(() => f.run(at(600)), /锁/);
  assert.equal(readFileSync(`${f.statePath}.lock`, 'utf8'), 'another process');
  assert.equal(existsSync(f.statePath), false);
});

test('does not follow state symlinks or silently regenerate malformed persisted slots', (t) => {
  const f = fixture(t);
  symlinkSync(f.configPath, f.statePath);
  const config = readFileSync(f.configPath, 'utf8');
  assert.throws(() => f.run(at(600)), /普通文件/);
  assert.equal(readFileSync(f.configPath, 'utf8'), config);
  rmSync(f.statePath);
  f.run(at(600));
  const state = f.state();
  const originalMinute = state.slots[1].minute;
  state.slots[1].minute = state.slots[0].minute;
  writeFileSync(f.statePath, JSON.stringify(state));
  assert.throws(() => f.run(at(600)), /状态/);
  assert.deepEqual(f.state(), state);
  state.slots[1].minute = originalMinute;
  state.date = '2026-02-31';
  writeFileSync(f.statePath, JSON.stringify(state));
  assert.throws(() => f.run(at(600)), /状态/);
  assert.deepEqual(f.state(), state);
});

test('repository command emits a JSON decision and CLI rejects incomplete arguments without writing state', (t) => {
  const f = fixture(t);
  const result = JSON.parse(
    execFileSync(
      'npm',
      [
        'run', '--silent', 'practice:schedule', '--', 'check',
        '--config', f.configPath, '--state', f.statePath,
      ],
      { cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8' },
    ),
  );
  assert.ok(['quiet', 'practice'].includes(result.action));
  const before = readFileSync(f.statePath, 'utf8');
  assert.throws(() =>
    execFileSync(
      process.execPath,
      [script, 'ack', '--config', f.configPath, '--state', f.statePath],
      { stdio: 'pipe' },
    ),
  );
  assert.equal(readFileSync(f.statePath, 'utf8'), before);
});
