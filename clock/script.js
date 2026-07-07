const tabButtons = document.querySelectorAll('.tab-button');
const panels = document.querySelectorAll('.panel');

const hourHand = document.getElementById('hourHand');
const minuteHand = document.getElementById('minuteHand');
const secondHand = document.getElementById('secondHand');
const digitalTime = document.getElementById('digitalTime');
const dateInfo = document.getElementById('dateInfo');
const timezoneSelect = document.getElementById('timezone');

const stopwatchDisplay = document.getElementById('stopwatchDisplay');
const stopwatchStartBtn = document.getElementById('stopwatchStart');
const stopwatchStopBtn = document.getElementById('stopwatchStop');
const stopwatchResetBtn = document.getElementById('stopwatchReset');
const stopwatchLapBtn = document.getElementById('stopwatchLap');
const lapList = document.getElementById('lapList');

const timerMinutes = document.getElementById('timerMinutes');
const timerSeconds = document.getElementById('timerSeconds');
const timerDisplay = document.getElementById('timerDisplay');
const timerStartBtn = document.getElementById('timerStart');
const timerPauseBtn = document.getElementById('timerPause');
const timerResetBtn = document.getElementById('timerReset');
const timerSoundToggle = document.getElementById('timerSound');

const accentColorInput = document.getElementById('accentColor');
const glowColorInput = document.getElementById('glowColor');
const bgTopInput = document.getElementById('bgTop');
const bgBottomInput = document.getElementById('bgBottom');
const starDensityInput = document.getElementById('starDensity');
const glowStrengthInput = document.getElementById('glowStrength');
const fontWeightSelect = document.getElementById('fontWeight');
const themePresetSelect = document.getElementById('themePreset');
const starField = document.getElementById('starField');

let timezone = 'local';
let stopwatchStartTime = null;
let stopwatchElapsed = 0;
let stopwatchInterval = null;
let lapTimes = [];

let timerRemaining = 30000; // default 30 seconds
let timerInterval = null;
let timerEndTimestamp = null;
let timerPaused = false;

let audioContext;
let ignoreThemeUpdate = false;

function switchTab(targetId) {
  panels.forEach(panel => panel.classList.toggle('active', panel.id === targetId));
  tabButtons.forEach(button => button.classList.toggle('active', button.dataset.target === targetId));
}

tabButtons.forEach(button => {
  button.addEventListener('click', () => switchTab(button.dataset.target));
});

function updateClock() {
  const now = new Date();
  let displayDate = now;

  if (timezone !== 'local') {
    const localeString = now.toLocaleString('en-US', { timeZone: timezone });
    displayDate = new Date(localeString);
  }

  const hours = displayDate.getHours();
  const minutes = displayDate.getMinutes();
  const seconds = displayDate.getSeconds();
  const milliseconds = displayDate.getMilliseconds();

  const hourRotation = (hours % 12) * 30 + minutes * 0.5;
  const minuteRotation = minutes * 6 + seconds * 0.1;
  const secondRotation = seconds * 6 + milliseconds * 0.006;

  hourHand.style.transform = `translate(-50%, 0) rotate(${hourRotation}deg) translateZ(18px)`;
  minuteHand.style.transform = `translate(-50%, 0) rotate(${minuteRotation}deg) translateZ(18px)`;
  secondHand.style.transform = `translate(-50%, 0) rotate(${secondRotation}deg) translateZ(18px)`;

  digitalTime.textContent = displayDate
    .toLocaleTimeString('ko-KR', { hour12: false });

  const dateText = displayDate
    .toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  dateInfo.textContent = dateText;

  requestAnimationFrame(updateClock);
}

requestAnimationFrame(updateClock);

timezoneSelect.addEventListener('change', () => {
  timezone = timezoneSelect.value;
});

function formatStopwatch(ms) {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
}

function updateStopwatchDisplay() {
  const elapsed = Date.now() - stopwatchStartTime + stopwatchElapsed;
  stopwatchDisplay.textContent = formatStopwatch(elapsed);
}

function startStopwatch() {
  if (stopwatchInterval) return;
  stopwatchStartTime = Date.now();
  stopwatchInterval = setInterval(updateStopwatchDisplay, 16);
  stopwatchStartBtn.disabled = true;
  stopwatchStopBtn.disabled = false;
  stopwatchResetBtn.disabled = false;
  stopwatchLapBtn.disabled = false;
}

function stopStopwatch() {
  if (!stopwatchInterval) return;
  clearInterval(stopwatchInterval);
  stopwatchInterval = null;
  stopwatchElapsed += Date.now() - stopwatchStartTime;
  stopwatchStartBtn.disabled = false;
  stopwatchStopBtn.disabled = true;
  stopwatchLapBtn.disabled = true;
}

function resetStopwatch() {
  clearInterval(stopwatchInterval);
  stopwatchInterval = null;
  stopwatchStartTime = null;
  stopwatchElapsed = 0;
  lapTimes = [];
  stopwatchDisplay.textContent = '00:00.000';
  lapList.innerHTML = '';
  stopwatchStartBtn.disabled = false;
  stopwatchStopBtn.disabled = true;
  stopwatchResetBtn.disabled = true;
  stopwatchLapBtn.disabled = true;
}

function recordLap() {
  const currentTime = stopwatchInterval ? Date.now() - stopwatchStartTime + stopwatchElapsed : stopwatchElapsed;
  lapTimes.unshift(currentTime);
  renderLapTimes();
}

function renderLapTimes() {
  lapList.innerHTML = lapTimes
    .map((lap, index) => {
      const diff = index === lapTimes.length - 1 ? lap : lap - lapTimes[index + 1];
      return `<li><span>랩 ${lapTimes.length - index}</span><span>${formatStopwatch(lap)}</span><span class="lap-diff">+${formatStopwatch(diff)}</span></li>`;
    })
    .join('');
}

stopwatchStartBtn.addEventListener('click', startStopwatch);
stopwatchStopBtn.addEventListener('click', stopStopwatch);
stopwatchResetBtn.addEventListener('click', resetStopwatch);
stopwatchLapBtn.addEventListener('click', recordLap);

function updateTimerDisplay(ms) {
  ms = Math.max(0, ms);
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const tenths = Math.floor((ms % 1000) / 100);
  timerDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths}`;
}

function scheduleTimer() {
  timerEndTimestamp = Date.now() + timerRemaining;
  timerInterval = requestAnimationFrame(tickTimer);
}

function tickTimer() {
  const now = Date.now();
  timerRemaining = Math.max(0, timerEndTimestamp - now);
  updateTimerDisplay(timerRemaining);

  if (timerRemaining <= 0) {
    finishTimer();
    return;
  }

  timerInterval = requestAnimationFrame(tickTimer);
}

function startTimer() {
  const total = Number(timerMinutes.value) * 60000 + Number(timerSeconds.value) * 1000;
  if (!timerPaused) {
    timerRemaining = total;
  }
  if (timerRemaining <= 0) return;

  timerPaused = false;
  scheduleTimer();
  timerStartBtn.disabled = true;
  timerPauseBtn.disabled = false;
  timerResetBtn.disabled = false;
  timerMinutes.disabled = true;
  timerSeconds.disabled = true;
}

function pauseTimer() {
  if (!timerInterval) return;
  timerPaused = true;
  cancelAnimationFrame(timerInterval);
  timerInterval = null;
  timerRemaining = Math.max(0, timerEndTimestamp - Date.now());
  timerStartBtn.disabled = false;
  timerPauseBtn.disabled = true;
}

function resetTimer() {
  timerPaused = false;
  cancelAnimationFrame(timerInterval);
  timerInterval = null;
  timerRemaining = Number(timerMinutes.value) * 60000 + Number(timerSeconds.value) * 1000;
  updateTimerDisplay(timerRemaining);
  timerStartBtn.disabled = false;
  timerPauseBtn.disabled = true;
  timerResetBtn.disabled = true;
  timerMinutes.disabled = false;
  timerSeconds.disabled = false;
}

function finishTimer() {
  cancelAnimationFrame(timerInterval);
  timerInterval = null;
  updateTimerDisplay(0);
  timerStartBtn.disabled = false;
  timerPauseBtn.disabled = true;
  timerMinutes.disabled = false;
  timerSeconds.disabled = false;
  timerPaused = false;

  if (timerSoundToggle.checked) {
    playChime();
  }
}

timerStartBtn.addEventListener('click', startTimer);
timerPauseBtn.addEventListener('click', pauseTimer);
timerResetBtn.addEventListener('click', resetTimer);

[timerMinutes, timerSeconds].forEach(input => {
  input.addEventListener('change', () => {
    const minutes = Math.max(0, Number(timerMinutes.value));
    const seconds = Math.min(59, Math.max(0, Number(timerSeconds.value)));
    timerMinutes.value = minutes;
    timerSeconds.value = seconds;
    timerRemaining = minutes * 60000 + seconds * 1000;
    updateTimerDisplay(timerRemaining);
  });
});

function playChime() {
  try {
    if (!audioContext) {
      audioContext = new AudioContext();
    }
    const duration = 0.9;
    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(880, now);
    oscillator.frequency.exponentialRampToValueAtTime(660, now + duration);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.5, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  } catch (error) {
    console.error('오디오를 재생할 수 없습니다:', error);
  }
}

function updateCSSVariable(variable, value) {
  document.documentElement.style.setProperty(variable, value);
}

function regenerateStars(density) {
  const size = Number(density);
  const stars = [];
  for (let i = 0; i < size; i += 1) {
    const x = Math.random() * 100;
    const y = Math.random() * 100;
    const opacity = Math.random() * 0.8 + 0.2;
    const scale = Math.random() * 1.4 + 0.4;
    stars.push(`radial-gradient(circle at ${x}% ${y}%, rgba(255,255,255,${opacity}) 0, transparent ${scale * 12}%)`);
  }
  starField.style.backgroundImage = stars.join(',');
}

accentColorInput.addEventListener('input', event => {
  updateCSSVariable('--accent', event.target.value);
  if (!ignoreThemeUpdate) {
    themePresetSelect.value = 'custom';
  }
});

glowColorInput.addEventListener('input', event => {
  const color = event.target.value;
  updateCSSVariable('--glow', hexToRgba(color, 0.6));
  if (!ignoreThemeUpdate) {
    themePresetSelect.value = 'custom';
  }
});

bgTopInput.addEventListener('input', event => {
  updateCSSVariable('--bg-top', event.target.value);
  if (!ignoreThemeUpdate) {
    themePresetSelect.value = 'custom';
  }
});

bgBottomInput.addEventListener('input', event => {
  updateCSSVariable('--bg-bottom', event.target.value);
  if (!ignoreThemeUpdate) {
    themePresetSelect.value = 'custom';
  }
});

starDensityInput.addEventListener('input', event => {
  regenerateStars(event.target.value);
  if (!ignoreThemeUpdate) {
    themePresetSelect.value = 'custom';
  }
});

glowStrengthInput.addEventListener('input', event => {
  updateCSSVariable('--glow-strength', `${event.target.value}px`);
  if (!ignoreThemeUpdate) {
    themePresetSelect.value = 'custom';
  }
});

fontWeightSelect.addEventListener('change', event => {
  updateCSSVariable('--font-weight', event.target.value);
  if (!ignoreThemeUpdate) {
    themePresetSelect.value = 'custom';
  }
});

themePresetSelect.addEventListener('change', event => {
  applyPreset(event.target.value);
});

function applyPreset(preset) {
  if (preset === 'aurora') {
    accentColorInput.value = '#84F1FF';
    glowColorInput.value = '#A865FF';
    bgTopInput.value = '#040B3C';
    bgBottomInput.value = '#2D0B4F';
    glowStrengthInput.value = 36;
  } else if (preset === 'neon') {
    accentColorInput.value = '#00FFD1';
    glowColorInput.value = '#FF41A1';
    bgTopInput.value = '#020202';
    bgBottomInput.value = '#1A0C3D';
    glowStrengthInput.value = 45;
  } else if (preset === 'sunrise') {
    accentColorInput.value = '#FFD273';
    glowColorInput.value = '#FF6F91';
    bgTopInput.value = '#301D5A';
    bgBottomInput.value = '#FF6F61';
    glowStrengthInput.value = 32;
  } else {
    return;
  }

  ignoreThemeUpdate = true;
  const event = new Event('input');
  accentColorInput.dispatchEvent(event);
  glowColorInput.dispatchEvent(event);
  bgTopInput.dispatchEvent(event);
  bgBottomInput.dispatchEvent(event);
  glowStrengthInput.dispatchEvent(new Event('input'));
  ignoreThemeUpdate = false;
  themePresetSelect.value = preset;
}

function hexToRgba(hex, alpha = 1) {
  let sanitized = hex.replace('#', '');
  if (sanitized.length === 3) {
    sanitized = sanitized.split('').map(char => char + char).join('');
  }
  const bigint = parseInt(sanitized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function initialize() {
  regenerateStars(starDensityInput.value);
  updateTimerDisplay(timerRemaining);
  updateCSSVariable('--accent', accentColorInput.value);
  updateCSSVariable('--glow', hexToRgba(glowColorInput.value, 0.6));
  updateCSSVariable('--bg-top', bgTopInput.value);
  updateCSSVariable('--bg-bottom', bgBottomInput.value);
  updateCSSVariable('--glow-strength', `${glowStrengthInput.value}px`);
  updateCSSVariable('--font-weight', fontWeightSelect.value);
}

initialize();

window.addEventListener('visibilitychange', () => {
  if (document.hidden && stopwatchInterval) {
    clearInterval(stopwatchInterval);
    stopwatchInterval = null;
    stopwatchElapsed += Date.now() - stopwatchStartTime;
    stopwatchStartBtn.disabled = false;
    stopwatchStopBtn.disabled = true;
    stopwatchLapBtn.disabled = true;
  }
  if (document.hidden && timerInterval) {
    const remaining = Math.max(0, timerEndTimestamp - Date.now());
    cancelAnimationFrame(timerInterval);
    timerInterval = null;
    timerRemaining = remaining;
  } else if (!document.hidden && timerRemaining > 0 && !timerPaused && timerPauseBtn.disabled === false) {
    scheduleTimer();
  }
});
