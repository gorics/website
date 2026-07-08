#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

APP = Path("os/real-multiboot/app.js")
OLD_BUILD = "20260708-r6multiboot"
NEW_BUILD = "20260708-r8-overlay-complete"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


def validate(text: str) -> None:
    required = (
        NEW_BUILD,
        "function completeDisplay",
        "display completion trigger=",
        "serial-gui-ready",
        "overlay.setAttribute('aria-hidden', 'true')",
        "completeDisplay(runToken, preset, 'screen-set-size')",
        "displayCompletedToken = 0",
    )
    missing = [marker for marker in required if marker not in text]
    if missing:
        raise RuntimeError(f"loader missing completion markers: {missing}")


def main() -> None:
    text = APP.read_text(encoding="utf-8")
    if NEW_BUILD in text:
        validate(text)
        print("multiboot overlay completion patch already present")
        return

    text = replace_once(
        text,
        f"const BUILD = '{OLD_BUILD}';",
        f"const BUILD = '{NEW_BUILD}';",
        "build marker",
    )
    text = replace_once(
        text,
        "  let displayTimer = null;\n  let lastProgressSignature = '';",
        "  let displayTimer = null;\n  let displayCompletedToken = 0;\n  let lastProgressSignature = '';",
        "display completion state",
    )
    text = replace_once(
        text,
        """    if (overlay) {
      overlay.classList.remove('idle', 'error', 'success', 'hidden');
      if (mode === 'idle') overlay.classList.add('idle');
      if (mode === 'error') overlay.classList.add('error');
      if (mode === 'success') overlay.classList.add('success');
    }""",
        """    if (overlay) {
      const preserveHidden = state === 'running' && mode !== 'error' && mode !== 'idle';
      overlay.classList.remove('idle', 'error', 'success');
      if (!preserveHidden) {
        overlay.classList.remove('hidden');
        overlay.removeAttribute('aria-hidden');
      }
      if (mode === 'idle') overlay.classList.add('idle');
      if (mode === 'error') overlay.classList.add('error');
      if (mode === 'success') overlay.classList.add('success');
    }""",
        "overlay state preservation",
    )
    text = replace_once(
        text,
        """  function hideOverlay() {
    overlay?.classList.add('hidden');
  }""",
        """  function hideOverlay() {
    if (!overlay) return;
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
  }""",
        "robust overlay hide",
    )
    text = replace_once(
        text,
        """      if (/openbox|graphical target|GORICS_GUI_READY/i.test(line)) {
        setStage('display', '그래픽 데스크톱 실행 중', 'Openbox 그래픽 환경 신호를 확인했습니다.', 99);
      }""",
        """      if (state !== 'running' && /openbox|graphical target|GORICS_GUI_READY/i.test(line)) {
        setStage('display', '그래픽 데스크톱 실행 중', 'Openbox 그래픽 환경 신호를 확인했습니다.', 99);
      }
      if (/GORICS_WEB_GUI_READY|GORICS_GUI_READY/i.test(line)) {
        const serialRunToken = token;
        const serialPreset = presets[selectedPreset] || presets.gorics;
        let attempts = 0;
        const settleTimer = setInterval(() => {
          attempts += 1;
          if (completeDisplay(serialRunToken, serialPreset, 'serial-gui-ready') || attempts >= 80) {
            clearInterval(settleTimer);
          }
        }, 250);
      }""",
        "serial completion bridge",
    )
    text = replace_once(
        text,
        """  function beginDisplayWatch(runToken, preset) {
""",
        """  function completeDisplay(runToken, preset, trigger = 'canvas-watch') {
    if (runToken !== token || !vm || displayCompletedToken === runToken) return false;
    const display = displaySnapshot(preset);
    if (!display.ready) return false;
    displayCompletedToken = runToken;
    clearInterval(displayTimer);
    log(`display completion trigger=${trigger} preset=${selectedPreset} canvas=${display.canvasWidth}x${display.canvasHeight} canvasVisible=${display.canvasVisible} textLength=${display.textLength}`);
    setStage('display', `${preset.name} 화면 출력 완료`, '가상 머신 화면이 준비됐습니다. 화면을 클릭하면 키보드와 포인터 입력이 활성화됩니다.', 100, 'success');
    setState('running');
    enableInput();
    focusScreen();
    clearTimeout(bootTimeout);
    hideOverlay();
    setTimeout(hideOverlay, 650);
    log(`display ready preset=${selectedPreset} name=${preset.name}`);
    return true;
  }

  function beginDisplayWatch(runToken, preset) {
""",
        "completion function insertion",
    )
    text = replace_once(
        text,
        """      const display = displaySnapshot(preset);
      if (!display.ready) return;
      clearInterval(displayTimer);
      log(`display verification passed preset=${selectedPreset} canvas=${display.canvasWidth}x${display.canvasHeight} canvasVisible=${display.canvasVisible} textLength=${display.textLength}`);
      setStage('display', `${preset.name} 화면 출력 완료`, '가상 머신 화면이 준비됐습니다. 화면을 클릭하면 키보드와 포인터 입력이 활성화됩니다.', 100, 'success');
      setState('running');
      enableInput();
      focusScreen();
      clearTimeout(bootTimeout);
      setTimeout(hideOverlay, 650);
      log(`display ready preset=${selectedPreset} name=${preset.name}`);""",
        """      completeDisplay(runToken, preset, 'canvas-watch');""",
        "display watcher completion",
    )
    text = replace_once(
        text,
        """    vm.add_listener('screen-set-size', (data) => {
      log(`screen-set-size ${JSON.stringify(data)}`);
      setStage('display', '화면 해상도 설정 중', `가상 디스플레이 크기가 ${JSON.stringify(data)}로 변경됐습니다.`, 96);
    });""",
        """    vm.add_listener('screen-set-size', (data) => {
      log(`screen-set-size ${JSON.stringify(data)}`);
      if (state !== 'running') {
        setStage('display', '화면 해상도 설정 중', `가상 디스플레이 크기가 ${JSON.stringify(data)}로 변경됐습니다.`, 96);
      }
      completeDisplay(runToken, preset, 'screen-set-size');
    });""",
        "screen size completion",
    )
    text = replace_once(
        text,
        """    lastProgressSignature = '';
    serialBuffer = '';
    inputLogged = false;
    setState('checking');""",
        """    lastProgressSignature = '';
    serialBuffer = '';
    inputLogged = false;
    displayCompletedToken = 0;
    setState('checking');""",
        "run completion reset",
    )
    validate(text)
    APP.write_text(text, encoding="utf-8")
    print(f"patched {APP} to {NEW_BUILD}")


if __name__ == "__main__":
    main()
