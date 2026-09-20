// 실제 CLI → Electron 선택창 → 저장·mailbox → 종료·복원 흐름 검사.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pokebuddy-companion-e2e-'));
const temp = path.join(dir, 'tmp');
fs.mkdirSync(temp);
const env = { ...process.env, HOME: dir, USERPROFILE: dir, APPDATA: path.join(dir, 'appdata'), LOCALAPPDATA: path.join(dir, 'localappdata'), TEMP: temp, TMP: temp };
for (const key of Object.keys(env)) {
  if (key.startsWith('POKEBUDDY_') || key === 'NODE_OPTIONS' || key === 'ELECTRON_RUN_AS_NODE') delete env[key];
}
env.PB_E2E_DIR = dir;
env.NODE_OPTIONS = `--require "${path.join(__dirname, 'e2e/companion-observer.cjs').split(path.sep).join('/')}"`;
// 세션용 환경이 남아 있어도 첫 선택창을 생략하면 안 됨.
env.POKEBUDDY_SLUG = 'pikachu';
const data = path.join(dir, '.claude', 'pokebuddy');
const saveFile = path.join(data, 'save.json');
const lock = path.join(data, 'companion.lock');
const checks = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const events = () => fs.existsSync(path.join(dir, 'events.jsonl')) ? fs.readFileSync(path.join(dir, 'events.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];

function cli(args) {
  const child = spawn(process.execPath, [path.join(root, 'bin/pokebuddy'), ...args], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error(`CLI 시간 초과: ${args.join(' ')}`)); }, 150000);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(timer);
      fs.appendFileSync(path.join(dir, 'cli.jsonl'), `${JSON.stringify({ args, code, stdout, stderr })}\n`);
      resolve({ code, stdout, stderr });
    });
  });
  return { child, done };
}
async function until(test, label, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (test()) return;
    await sleep(100);
  }
  throw new Error(`대기 실패: ${label}`);
}
async function game(...args) {
  const result = await cli(['game', ...args]).done;
  assert.equal(result.code, 0, result.stderr || result.stdout);
  const value = JSON.parse(result.stdout);
  assert.equal(value.ok, true);
  return value;
}
async function run() {
  console.log(`E2E 임시 데이터: ${dir}`);
  try {
    const first = cli(['companion']);
    await until(() => events().some((e) => e.event === 'picker-ready'), '포켓몬 인자 없는 첫 선택창');
    assert.equal(events().find((e) => e.event === 'boot').slugEnv, null);
    assert.equal(events().find((e) => e.event === 'picker-ready').count, 29);
    checks.push('포켓몬 인자 없이 첫 선택창. 세션 환경변수로 선택 생략 없음');
    fs.writeFileSync(path.join(dir, 'action.json'), JSON.stringify({ kind: 'pick-eevee' }));
    const firstResult = await first.done;
    assert.equal(firstResult.code, 0, firstResult.stderr);
    assert.match(firstResult.stdout, /동반자를 띄움/);
    const saved = JSON.parse(fs.readFileSync(saveFile, 'utf8'));
    assert.equal(saved.party.length, 1);
    assert.equal(saved.party[0].species, 'eevee');
    const id = saved.party[0].id;
    checks.push('선택창에서 이브이 선택 후 실제 앱 준비와 저장');
    const beforeLock = fs.readFileSync(lock, 'utf8');
    const duplicate = await cli(['companion']).done;
    assert.match(duplicate.stdout, /이미 떠 있음/);
    assert.equal(fs.readFileSync(lock, 'utf8'), beforeLock);
    await game('snapshot');
    checks.push('중복 실행은 기존 프로세스와 저장 유지. 실제 mailbox 조회');
    const sizeResult = await cli(['game', 'pet.set', id, 'size=3']).done;
    assert.equal(JSON.parse(sizeResult.stdout).reason, 'not-yet');
    assert.equal(JSON.parse(fs.readFileSync(saveFile, 'utf8')).party[0].size, saved.party[0].size);
    checks.push('크기 변경 명령은 미구현으로 확인. 저장 크기는 변경되지 않음');
    await game('pet.set', id, JSON.stringify({ home: { dx: -40, dy: -70 } }));
    await game('party.hide', id);
    assert.equal(JSON.parse(fs.readFileSync(saveFile, 'utf8')).party[0].shown, false);
    await game('party.show', id);
    await game('feed', id);
    checks.push('위치·숨기기·다시 표시·돌봄을 CLI에서 앱으로 전달');
    const stopped = await cli(['companion', 'stop']).done;
    assert.equal(stopped.code, 0, stopped.stderr);
    await until(() => !fs.existsSync(lock), '종료 잠금 해제');
    const selectedCount = events().filter((e) => e.event === 'picker-ready').length;
    const restored = await cli(['companion']).done;
    assert.equal(restored.code, 0, restored.stderr);
    assert.equal(events().filter((e) => e.event === 'picker-ready').length, selectedCount);
    const restoredSave = JSON.parse(fs.readFileSync(saveFile, 'utf8'));
    assert.equal(restoredSave.party[0].id, id);
    assert.equal(restoredSave.party[0].size, saved.party[0].size);
    assert.deepEqual(restoredSave.party[0].home, { dx: -40, dy: -70 });
    assert.equal(restoredSave.party[0].shown, true);
    checks.push('종료 후 재실행에서 선택창 없이 같은 파티·크기 복원');
    await cli(['companion', 'stop']).done;
    await until(() => !fs.existsSync(lock), '복원 검사 후 종료');
    const emptySave = JSON.parse(fs.readFileSync(saveFile, 'utf8'));
    emptySave.party = [];
    fs.writeFileSync(saveFile, JSON.stringify(emptySave));
    const cancelled = cli(['companion']);
    await until(() => events().filter((e) => e.event === 'picker-ready').length === selectedCount + 1, '빈 파티의 선택창');
    fs.writeFileSync(path.join(dir, 'action.json'), JSON.stringify({ kind: 'cancel' }));
    const cancelResult = await cancelled.done;
    assert.equal(cancelResult.code, 0, cancelResult.stderr);
    assert.match(cancelResult.stdout, /첫 실행/);
    assert.doesNotMatch(cancelResult.stderr, /뜨지 못함/);
    assert.deepEqual(JSON.parse(fs.readFileSync(saveFile, 'utf8')), emptySave);
    const status = await cli(['status']).done;
    assert.doesNotMatch(status.stdout, /마지막 펫 실패/);
    checks.push('기존 저장의 빈 파티도 선택창 제공. 선택 취소는 정상 종료하며 저장 유지');
    const pending = cli(['companion']);
    await until(() => events().filter((e) => e.event === 'picker-ready').length === selectedCount + 2, '종료 검사 선택창');
    const stoppedPicker = await cli(['companion', 'stop']).done;
    assert.equal(stoppedPicker.code, 0, stoppedPicker.stderr);
    const pendingResult = await pending.done;
    assert.equal(pendingResult.code, 0, pendingResult.stderr);
    assert.deepEqual(JSON.parse(fs.readFileSync(saveFile, 'utf8')), emptySave);
    checks.push('선택 중 companion stop은 정상 종료하며 저장 유지');
    const unsaved = cli(['companion']);
    await until(() => events().filter((e) => e.event === 'picker-ready').length === selectedCount + 3, '저장 실패 검사 선택창');
    // 이 검사가 만든 저장 경로를 빈 디렉터리로 바꿔 쓰기 실패 재현.
    fs.renameSync(saveFile, `${saveFile}.e2e-backup`);
    fs.mkdirSync(saveFile);
    try {
      fs.writeFileSync(path.join(dir, 'action.json'), JSON.stringify({ kind: 'pick-eevee' }));
      const unsavedResult = await unsaved.done;
      assert.equal(unsavedResult.code, 1, unsavedResult.stdout);
      assert.equal(JSON.parse(fs.readFileSync(path.join(data, 'last-error.json'), 'utf8')).reason, 'save-failed');
      assert.doesNotMatch(unsavedResult.stdout, /동반자를 띄움/);
      checks.push('첫 포켓몬 저장 실패는 취소와 구분하며 실행 성공을 알리지 않음');
    } finally {
      fs.rmdirSync(saveFile);
      fs.renameSync(`${saveFile}.e2e-backup`, saveFile);
    }
    assert.equal(events().filter((e) => ['preload-error', 'observer-error'].includes(e.event)).length, 0);
  } finally {
    await cli(['companion', 'stop']).done;
    fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify({ checks, dir }, null, 2));
  }
  console.log(JSON.stringify({ result: 'PASS', checks, dir }, null, 2));
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
