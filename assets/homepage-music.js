/* Original, softly synthesized instrumental loop for the homepage. */
(() => {
  const button = document.getElementById('music-toggle');
  const label = document.getElementById('music-toggle-label');
  if (!button || !label) return;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    button.disabled = true;
    button.title = '이 브라우저에서는 배경음악을 재생할 수 없습니다';
    label.textContent = '음악 미지원';
    return;
  }

  const preferenceKey = 'stargate-homepage-music';
  let pausedByUser = false;
  try { pausedByUser = localStorage.getItem(preferenceKey) === 'paused'; } catch (_) {}

  let context = null;
  let output = null;
  let timer = null;
  let nextTime = 0;
  let step = 0;
  let requestId = 0;
  const beat = 0.5;
  const chords = [
    [45, 52, 57, 60], // A minor 7
    [41, 48, 52, 57], // F major 7
    [48, 52, 55, 59], // C major 7
    [43, 50, 55, 59]  // G major 7
  ];
  const melody = [69, null, 72, null, 76, null, 72, null,
    69, null, 72, 76, null, 74, null, null,
    67, null, 72, null, 76, null, 79, null,
    74, null, 71, null, 69, null, 67, null];

  const frequency = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
  const setPreference = (value) => {
    try { localStorage.setItem(preferenceKey, value); } catch (_) {}
  };
  const setButton = (playing) => {
    button.setAttribute('aria-pressed', String(playing));
    const text = playing ? '음악 끄기' : '음악 켜기';
    label.textContent = text;
    button.title = playing ? '배경음악 끄기' : '배경음악 켜기';
  };

  function tone(midi, when, duration, peak, type, attack) {
    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency(midi);
    filter.type = 'lowpass';
    filter.frequency.value = type === 'triangle' ? 1050 : 1800;
    envelope.gain.setValueAtTime(0, when);
    envelope.gain.linearRampToValueAtTime(peak, when + attack);
    envelope.gain.setValueAtTime(peak, when + duration - 0.65);
    envelope.gain.exponentialRampToValueAtTime(0.001, when + duration);
    oscillator.connect(filter).connect(envelope).connect(output);
    oscillator.start(when);
    oscillator.stop(when + duration + 0.02);
  }

  function scheduleNote(index, when) {
    if (index % 8 === 0) {
      for (const midi of chords[index / 8]) {
        tone(midi, when, 4.15, 0.12, 'sine', 0.9);
        tone(midi + 12, when, 4.15, 0.035, 'triangle', 1.3);
      }
    }
    const note = melody[index];
    if (note !== null) {
      tone(note, when, 1.15, 0.12, 'sine', 0.025);
      tone(note + 12, when, 0.8, 0.025, 'triangle', 0.025);
    }
  }

  function scheduleAhead() {
    if (!context || context.state !== 'running') return;
    while (nextTime < context.currentTime + 0.3) {
      scheduleNote(step, nextTime);
      nextTime += beat;
      step = (step + 1) % melody.length;
    }
  }

  function removeGestureListeners() {
    document.removeEventListener('pointerdown', onGesture, true);
    document.removeEventListener('keydown', onGesture, true);
  }
  function addGestureListeners() {
    document.addEventListener('pointerdown', onGesture, true);
    document.addEventListener('keydown', onGesture, true);
  }
  function stop() {
    requestId++;
    clearInterval(timer);
    timer = null;
    const oldContext = context;
    context = null;
    output = null;
    if (oldContext) oldContext.close().catch(() => {});
    setButton(false);
  }

  async function start() {
    if (pausedByUser || context) return;
    const id = ++requestId;
    let newContext;
    try {
      newContext = new AudioContextClass();
      await newContext.resume();
      if (id !== requestId || newContext.state !== 'running') {
        await newContext.close();
        if (!pausedByUser) addGestureListeners();
        return;
      }
      context = newContext;
      output = context.createGain();
      output.gain.value = 0.13;
      output.connect(context.destination);
      step = 0;
      nextTime = context.currentTime + 0.05;
      scheduleAhead();
      timer = setInterval(scheduleAhead, 100);
      removeGestureListeners();
      setButton(true);
    } catch (_) {
      if (newContext && newContext.state !== 'closed') newContext.close().catch(() => {});
      if (!pausedByUser) addGestureListeners();
      setButton(false);
    }
  }

  function onGesture(event) {
    if (button.contains(event.target)) return;
    if (event.type === 'keydown' && !['Enter', ' ', 'Spacebar'].includes(event.key)) return;
    start();
  }

  button.addEventListener('click', () => {
    if (context) {
      pausedByUser = true;
      setPreference('paused');
      removeGestureListeners();
      stop();
    } else {
      pausedByUser = false;
      setPreference('on');
      addGestureListeners();
      start();
    }
  });

  if (!pausedByUser) {
    // A blocked resume() can remain pending until a user gesture.
    addGestureListeners();
    start();
  }
})();
