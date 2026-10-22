(() => {
  const flow = document.getElementById('tool-flow');
  const stage = document.getElementById('tool-stage');
  const title = document.getElementById('tool-title');
  const back = document.getElementById('tool-back');
  const noiseInput = document.getElementById('noise-file');
  const beforeInput = document.getElementById('compare-before-file');
  const afterInput = document.getElementById('compare-after-file');
  const toolToast = document.getElementById('tool-toast');
  const cleanerPageBackground = document.getElementById('cleaner-page-background');
  const toolMeta = [
    { title: 'Speaker Cleaner' },
    { title: 'Noise Remover' },
    { title: 'Sound Compare' }
  ];
  let activeTool = 0;
  let toolView = 'ready';
  let cleanerSession = null;
  let noiseFile = null;
  let noiseSourceUrl = '';
  let noiseResultUrl = '';
  let noiseResultBuffer = null;
  let compareBefore = null;
  let compareAfter = null;
  let compareBeforeUrl = '';
  let compareAfterUrl = '';
  let customCleanerFile = null;
  let customCleanerUrl = '';
  let customCleanerAudio = null;
  let customCleanerTimer = null;
  let cleanerDuration = 12;
  const cleanerRanges = [{ low:140, high:200 }, { low:165, high:230 }, { low:190, high:260 }];
  let cleanerRangeIndex = 1;
  let toastTimer = null;

  const icon = name => `assets/icons/${name}.svg`;
  const escapeHtml = value => String(value).replace(/[&<>'"]/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[character]);
  const formatDuration = seconds => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
  const formatSize = bytes => bytes < 1048576 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
  const waveBars = (count = 15, seed = 0) => {
    const profiles = [
      [24,38,55,40,52,70,82,96,82,70,52,40,55,38,24],
      [22,34,48,61,43,57,74,92,80,65,49,59,45,32,22]
    ];
    const profile = profiles[Math.abs(seed) % profiles.length];
    return Array.from({ length: count }, (_, bar) => {
      const source = Math.round(bar * (profile.length - 1) / Math.max(1, count - 1));
      const distance = Math.abs(bar - (count - 1) / 2) / Math.max(1, (count - 1) / 2);
      const opacity = (.58 + (1 - distance) * .38).toFixed(2);
      return `<i style="--level:${profile[source]};--wave-alpha:${opacity}"></i>`;
    }).join('');
  };
  const mainWave = () => '<div class="tool-wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>';

  function showToolToast(message) {
    clearTimeout(toastTimer);
    toolToast.textContent = message;
    toolToast.classList.add('show');
    toastTimer = setTimeout(() => toolToast.classList.remove('show'), 1800);
  }

  function setHeader(tool, view = 'ready') {
    activeTool = tool;
    toolView = view;
    title.textContent = toolMeta[tool].title;
    flow.setAttribute('aria-label', `${toolMeta[tool].title}, ${view}`);
    const useReferenceBackground = tool === 0 && view === 'ready';
    flow.classList.toggle('cleaner-reference-ready', useReferenceBackground);
    cleanerPageBackground.hidden = true;
  }

  function openTool(tool) {
    setHeader(tool, 'ready');
    flow.hidden = false;
    document.querySelectorAll('.status, .top-control, #page-title, .page').forEach(element => element.setAttribute('aria-hidden', 'true'));
    document.querySelector('.bottom-nav').setAttribute('aria-hidden', 'true');
    document.querySelector('.create').setAttribute('aria-hidden', 'true');
    if (tool === 0) renderCleanerReady();
    if (tool === 1) renderNoiseReady();
    if (tool === 2) renderCompareReady();
    setTimeout(() => back.focus({ preventScroll: true }), 30);
  }

  function closeTool() {
    stopCleaner(false);
    stopCustomCleaner();
    if (activeTool === 1) resetNoiseSession();
    if (activeTool === 2) resetCompareSession();
    if (customCleanerUrl) URL.revokeObjectURL(customCleanerUrl);
    customCleanerUrl = '';
    customCleanerFile = null;
    flow.hidden = true;
    document.querySelectorAll('.status, .top-control, #page-title, .page').forEach(element => element.removeAttribute('aria-hidden'));
    document.querySelector('.bottom-nav').removeAttribute('aria-hidden');
    document.querySelector('.create').removeAttribute('aria-hidden');
    renderCheck(index);
    card.focus({ preventScroll: true });
  }

  function stopCustomCleaner() {
    clearInterval(customCleanerTimer);
    customCleanerTimer = null;
    if (customCleanerAudio) {
      customCleanerAudio.pause();
      customCleanerAudio.currentTime = 0;
      customCleanerAudio = null;
    }
  }

  function renderCustomCleanerReady() {
    if (!customCleanerFile) return renderCleanerReady();
    setHeader(0, 'ready');
    title.textContent = 'Speaker Playback';
    cleanerPageBackground.hidden = true;
    flow.classList.remove('cleaner-reference-ready');
    stage.innerHTML = `
      <article class="tool-panel import-panel"><div class="import-wave" aria-hidden="true">${waveBars(15, customCleanerFile.size % 2)}</div><span class="import-icon"><img src="${icon('file-audio')}" alt=""></span><h3>${escapeHtml(customCleanerFile.name)}</h3><p>${formatSize(customCleanerFile.size)}</p></article>
      <article class="tool-panel cleaner-progress"><div class="cleaner-progress-head"><strong>Ready to play</strong><span id="custom-cleaner-time">0:00</span></div><p>Keep the speaker uncovered while the sound plays.</p><div class="process-track"><div class="process-fill" id="custom-cleaner-fill" style="width:0"></div></div></article>
      <div class="tool-actions"><button class="tool-primary" id="custom-cleaner-start" type="button">Play sound</button><button class="tool-text" id="custom-cleaner-replace" type="button">Choose another file</button></div>`;
    document.getElementById('custom-cleaner-start').addEventListener('click', startCustomCleaner);
    document.getElementById('custom-cleaner-replace').addEventListener('click', () => document.getElementById('global-audio-file').click());
  }

  function startCustomCleaner() {
    stopCustomCleaner();
    if (!customCleanerUrl) customCleanerUrl = URL.createObjectURL(customCleanerFile);
    customCleanerAudio = new Audio(customCleanerUrl);
    const button = document.getElementById('custom-cleaner-start');
    const stopButton = button.cloneNode(true);
    stopButton.textContent = 'Stop playback';
    button.replaceWith(stopButton);
    stopButton.addEventListener('click', () => { stopCustomCleaner(); renderCustomCleanerReady(); });
    customCleanerAudio.addEventListener('loadedmetadata', () => {
      const duration = Number.isFinite(customCleanerAudio.duration) ? customCleanerAudio.duration : 0;
      customCleanerTimer = setInterval(() => {
        if (!customCleanerAudio) return;
        const elapsed = customCleanerAudio.currentTime;
        const fill = document.getElementById('custom-cleaner-fill');
        const time = document.getElementById('custom-cleaner-time');
        if (fill && duration) fill.style.width = `${Math.min(100, elapsed / duration * 100)}%`;
        if (time) time.textContent = formatDuration(elapsed);
      }, 120);
    });
    customCleanerAudio.addEventListener('ended', () => {
      const completedDuration = customCleanerAudio ? customCleanerAudio.duration : 0;
      stopCustomCleaner();
      localStorage.setItem('speakerCleanerResult', JSON.stringify({ completedAt:new Date().toISOString(), duration:Math.round(completedDuration || 0), range:'Imported sound' }));
      renderCustomCleanerReady();
      showToolToast('Playback complete.');
    });
    customCleanerAudio.play().catch(() => { stopCustomCleaner(); showToolToast('This audio file could not be played.'); });
  }

  function renderCleanerReady() {
    setHeader(0, 'ready');
    const range = cleanerRanges[cleanerRangeIndex];
    stage.innerHTML = `
      <div class="cleaner-hero"><img class="cleaner-hero-art reference" src="assets/illustrations/speaker-cleaner-reference-bg.png" alt="A translucent cleaning brush moving dust from a phone speaker"><span class="cleaner-badge"><i aria-hidden="true"></i>Dust release</span></div>
      <div class="cleaner-controls">
        <div class="cleaner-control"><small>Cycle</small><div class="cleaner-stepper"><button type="button" data-cycle="-4" aria-label="Shorter cycle">−</button><strong>${cleanerDuration} sec</strong><button type="button" data-cycle="4" aria-label="Longer cycle">+</button></div></div>
        <div class="cleaner-control"><small>Tone range</small><div class="cleaner-stepper"><button type="button" data-range="-1" aria-label="Lower tone range">−</button><strong>${range.low}–${range.high}</strong><button type="button" data-range="1" aria-label="Higher tone range">+</button></div></div>
      </div>
      <div class="tool-actions"><button class="tool-primary" id="cleaner-start" type="button">Start cleaning</button></div>`;
    stage.querySelectorAll('[data-cycle]').forEach(button => button.addEventListener('click', () => {
      cleanerDuration = Math.max(8, Math.min(20, cleanerDuration + Number(button.dataset.cycle)));
      renderCleanerReady();
    }));
    stage.querySelectorAll('[data-range]').forEach(button => button.addEventListener('click', () => {
      cleanerRangeIndex = Math.max(0, Math.min(cleanerRanges.length - 1, cleanerRangeIndex + Number(button.dataset.range)));
      renderCleanerReady();
    }));
    document.getElementById('cleaner-start').addEventListener('click', startCleaner);
  }

  async function startCleaner() {
    stopCleaner(false);
    setHeader(0, 'process');
    const range = cleanerRanges[cleanerRangeIndex];
    stage.innerHTML = `
      <div class="cleaner-hero running" id="cleaner-orb"><img class="cleaner-hero-art reference" src="assets/illustrations/speaker-cleaner-reference-bg.png" alt="Sound vibration clearing a phone speaker"><span class="cleaner-badge"><i aria-hidden="true"></i><span id="cleaner-frequency">${range.low} Hz sweep</span></span></div>
      <article class="tool-panel cleaner-progress"><div class="cleaner-progress-head"><strong>Cleaning in progress</strong><span id="cleaner-percent">0%</span></div><p>Keep the speaker uncovered and facing down</p><div class="process-track"><div class="process-fill" id="cleaner-fill" style="width:0"></div></div></article>
      <div class="tool-actions"><button class="tool-secondary" id="cleaner-stop" type="button">Stop cycle</button></div>`;
    document.getElementById('cleaner-stop').addEventListener('click', () => stopCleaner(true));
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const context = new AudioContextClass();
      await context.resume();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + .12);
      const duration = cleanerDuration;
      for (let segment = 0; segment < duration; segment += 1) {
        const at = context.currentTime + segment;
        oscillator.frequency.setValueAtTime(segment % 2 ? range.high : range.low, at);
        oscillator.frequency.linearRampToValueAtTime(segment % 2 ? range.low : range.high, at + .95);
      }
      gain.gain.setValueAtTime(.08, context.currentTime + duration - .2);
      gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + duration);
      const started = performance.now();
      cleanerSession = { context, oscillator, gain, started, duration, raf: 0 };
      const tick = () => {
        if (!cleanerSession) return;
        const elapsed = (performance.now() - started) / 1000;
        const progress = Math.min(1, elapsed / duration);
        const percent = document.getElementById('cleaner-percent');
        const frequency = document.getElementById('cleaner-frequency');
        const fill = document.getElementById('cleaner-fill');
        if (percent) percent.textContent = `${Math.round(progress * 100)}%`;
        if (frequency) frequency.textContent = `${Math.round(range.low + (range.high - range.low) * Math.abs(Math.sin(elapsed * Math.PI)))} Hz sweep`;
        if (fill) fill.style.width = `${Math.round(progress * 100)}%`;
        if (progress >= 1) return completeCleaner();
        cleanerSession.raf = requestAnimationFrame(tick);
      };
      cleanerSession.raf = requestAnimationFrame(tick);
    } catch (error) {
      showToolToast('Audio playback is unavailable in this browser.');
      renderCleanerReady();
    }
  }

  function stopCleaner(returnToReady = true) {
    if (cleanerSession) {
      cancelAnimationFrame(cleanerSession.raf);
      try { cleanerSession.oscillator.stop(); } catch (error) {}
      cleanerSession.context.close().catch(() => {});
      cleanerSession = null;
    }
    if (returnToReady && !flow.hidden) renderCleanerReady();
  }

  function completeCleaner() {
    stopCleaner(false);
    const range = cleanerRanges[cleanerRangeIndex];
    const result = { completedAt: new Date().toISOString(), duration: cleanerDuration, range: `${range.low}–${range.high} Hz` };
    localStorage.setItem('speakerCleanerResult', JSON.stringify(result));
    setHeader(0, 'result');
    stage.innerHTML = `
      <div class="cleaner-hero complete"><img class="cleaner-hero-art reference" src="assets/illustrations/speaker-cleaner-reference-bg.png" alt="Phone speaker cleaning complete"><span class="cleaner-badge"><i aria-hidden="true"></i>Cycle complete</span></div>
      <article class="tool-panel cleaner-status"><span class="tool-info-icon"><img src="${icon('waveform')}" alt=""></span><div><strong>Complete · ${cleanerDuration} sec · ${range.low}–${range.high} Hz</strong></div></article>
      <div class="tool-actions"><button class="tool-primary" id="cleaner-finish" type="button">Finish</button><button class="tool-secondary" id="cleaner-again" type="button">Run again</button></div>`;
    document.getElementById('cleaner-finish').addEventListener('click', closeTool);
    document.getElementById('cleaner-again').addEventListener('click', renderCleanerReady);
  }

  function renderNoiseReady() {
    setHeader(1, 'ready');
    stage.innerHTML = `
      <button class="tool-panel import-panel" id="noise-dropzone" type="button" aria-label="Choose a recording"><div class="import-wave" aria-hidden="true">${waveBars(15, 0)}</div><span class="import-icon"><img src="${icon('upload-simple')}" alt=""></span><h3>Choose a recording</h3><p>M4A · MP3 · WAV</p></button>
      <div class="privacy-note"><img src="${icon('lock-simple')}" alt="">Processed on this device</div>
      <div class="tool-actions"><button class="tool-primary" id="noise-choose" type="button">Choose recording</button><button class="tool-secondary" id="noise-record" type="button">Record now</button></div>`;
    document.getElementById('noise-choose').addEventListener('click', () => noiseInput.click());
    document.getElementById('noise-dropzone').addEventListener('click', () => noiseInput.click());
    document.getElementById('noise-record').addEventListener('click', () => document.getElementById('quick-record').click());
  }

  async function loadAudio(file) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const context = new AudioContextClass();
    try { return await context.decodeAudioData(await file.arrayBuffer()); }
    finally { await context.close(); }
  }

  async function selectNoiseFile(file) {
    if (!file) return;
    noiseFile = file;
    if (noiseSourceUrl) URL.revokeObjectURL(noiseSourceUrl);
    noiseSourceUrl = URL.createObjectURL(file);
    setHeader(1, 'process');
    stage.innerHTML = `
      <article class="tool-panel file-summary"><span class="import-icon"><img src="${icon('file-audio')}" alt=""></span><div><h3>${escapeHtml(file.name)}</h3><p>${formatSize(file.size)} · Reading audio…</p></div><div class="mini-wave">${waveBars(15, file.size % 2)}</div></article>
      <article class="tool-panel process-panel"><h3>Ready to enhance</h3><p>Reduces low rumble and high hiss, then balances voice level.</p><div class="process-track"><div class="process-fill" style="width:0"></div></div><div class="process-value">Ready</div></article>
      <div class="tool-actions"><button class="tool-primary" id="noise-process" type="button">Enhance recording</button><button class="tool-text" id="noise-replace" type="button">Choose another file</button></div>`;
    document.getElementById('noise-replace').addEventListener('click', () => noiseInput.click());
    document.getElementById('noise-process').addEventListener('click', processNoiseFile);
    try {
      const buffer = await loadAudio(file);
      const copy = stage.querySelector('.file-summary p');
      if (copy) copy.textContent = `${formatDuration(buffer.duration)} · ${buffer.sampleRate / 1000} kHz · ${formatSize(file.size)}`;
    } catch (error) { showToolToast('This recording could not be decoded.'); }
  }

  async function processNoiseFile() {
    if (!noiseFile) return;
    const button = document.getElementById('noise-process');
    const fill = stage.querySelector('.process-fill');
    const value = stage.querySelector('.process-value');
    button.disabled = true;
    button.textContent = 'Enhancing…';
    fill.style.width = '18%'; value.textContent = 'Analyzing recording';
    try {
      const inputBuffer = await loadAudio(noiseFile);
      fill.style.width = '42%'; value.textContent = 'Reducing background noise';
      const offline = new OfflineAudioContext(inputBuffer.numberOfChannels, inputBuffer.length, inputBuffer.sampleRate);
      const source = offline.createBufferSource();
      const highpass = offline.createBiquadFilter();
      const lowpass = offline.createBiquadFilter();
      const compressor = offline.createDynamicsCompressor();
      source.buffer = inputBuffer;
      highpass.type = 'highpass'; highpass.frequency.value = 85; highpass.Q.value = .72;
      lowpass.type = 'lowpass'; lowpass.frequency.value = Math.min(9000, inputBuffer.sampleRate * .42); lowpass.Q.value = .45;
      compressor.threshold.value = -28; compressor.knee.value = 18; compressor.ratio.value = 3.5; compressor.attack.value = .012; compressor.release.value = .22;
      source.connect(highpass).connect(lowpass).connect(compressor).connect(offline.destination);
      source.start();
      noiseResultBuffer = await offline.startRendering();
      fill.style.width = '82%'; value.textContent = 'Preparing new audio file';
      const wav = audioBufferToWav(noiseResultBuffer);
      if (noiseResultUrl) URL.revokeObjectURL(noiseResultUrl);
      noiseResultUrl = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
      fill.style.width = '100%'; value.textContent = 'Complete';
      localStorage.setItem('noiseRemoverResult', JSON.stringify({ completedAt: new Date().toISOString(), name: noiseFile.name, duration: noiseResultBuffer.duration }));
      setTimeout(renderNoiseResult, 300);
    } catch (error) {
      button.disabled = false; button.textContent = 'Enhance recording';
      fill.style.width = '0'; value.textContent = 'Could not process this file';
      showToolToast('Try a different M4A, MP3, or WAV recording.');
    }
  }

  function renderNoiseResult() {
    setHeader(1, 'result');
    stage.innerHTML = `
      <article class="tool-panel audio-players"><div class="audio-row"><label>Original</label><audio controls src="${noiseSourceUrl}"></audio></div><div class="audio-row"><label>Enhanced</label><audio controls src="${noiseResultUrl}"></audio></div></article>
      <div class="metric-grid"><div class="metric-card"><small>Filters</small><strong>2</strong><em>Rumble + hiss</em></div><div class="metric-card"><small>Output</small><strong>WAV</strong><em>Original kept</em></div></div>
      <div class="tool-actions"><button class="tool-primary" id="noise-download" type="button">Save enhanced audio</button><button class="tool-secondary" id="noise-finish" type="button">Finish</button></div>`;
    document.getElementById('noise-download').addEventListener('click', () => {
      const link = document.createElement('a');
      const base = noiseFile.name.replace(/\.[^.]+$/, '');
      link.href = noiseResultUrl; link.download = `${base}-enhanced.wav`; link.click();
      showToolToast('Enhanced audio saved.');
    });
    document.getElementById('noise-finish').addEventListener('click', () => { resetNoiseSession(); closeTool(); });
  }

  function resetNoiseSession() {
    if (noiseSourceUrl) URL.revokeObjectURL(noiseSourceUrl);
    if (noiseResultUrl) URL.revokeObjectURL(noiseResultUrl);
    noiseSourceUrl = ''; noiseResultUrl = ''; noiseFile = null; noiseResultBuffer = null;
  }

  function renderCompareReady() {
    setHeader(2, 'ready');
    stage.innerHTML = `
      <div class="compare-slots">
        ${compareSlot('Before', compareBefore, 'compare-before')}
        <span class="compare-link" aria-hidden="true"></span>
        ${compareSlot('After', compareAfter, 'compare-after')}
      </div>
      <div class="tool-actions"><button class="tool-primary" id="compare-main" type="button">${compareBefore ? (compareAfter ? 'Compare sounds' : 'Add second recording') : 'Add first recording'}</button><button class="tool-secondary" id="compare-record" type="button">Record sound</button>${compareBefore || compareAfter ? '<button class="tool-text" id="compare-reset" type="button">Clear recordings</button>' : ''}</div>`;
    document.getElementById('compare-before').addEventListener('click', () => beforeInput.click());
    document.getElementById('compare-after').addEventListener('click', () => afterInput.click());
    document.getElementById('compare-main').addEventListener('click', () => {
      if (!compareBefore) return beforeInput.click();
      if (!compareAfter) return afterInput.click();
      compareSounds();
    });
    document.getElementById('compare-record').addEventListener('click', () => document.getElementById('quick-record').click());
    const reset = document.getElementById('compare-reset');
    if (reset) reset.addEventListener('click', () => { resetCompareSession(); renderCompareReady(); });
  }

  function compareSlot(label, item, id) {
    return `<article class="compare-slot ${item ? 'complete' : ''}"><div class="compare-slot-label">${label}</div><p>${item ? `${escapeHtml(item.file.name)} · ${formatDuration(item.buffer.duration)}` : 'Add recording'}</p><button class="slot-action" id="${id}" type="button" aria-label="${item ? 'Replace' : 'Add'} ${label.toLowerCase()} recording"><img src="${icon(item ? 'check-circle' : 'plus')}" alt=""></button><div class="slot-wave" aria-hidden="true">${waveBars(15, item ? item.file.size % 2 : (label === 'After' ? 1 : 0))}</div></article>`;
  }

  async function selectCompareFile(file, which) {
    if (!file) return;
    try {
      const buffer = await loadAudio(file);
      const item = { file, buffer };
      if (which === 'before') { compareBefore = item; if (compareBeforeUrl) URL.revokeObjectURL(compareBeforeUrl); compareBeforeUrl = URL.createObjectURL(file); }
      else { compareAfter = item; if (compareAfterUrl) URL.revokeObjectURL(compareAfterUrl); compareAfterUrl = URL.createObjectURL(file); }
      renderCompareReady();
    } catch (error) { showToolToast('This recording could not be decoded.'); }
  }

  function analyzeAudio(buffer) {
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, channel) => buffer.getChannelData(channel));
    const stride = Math.max(1, Math.floor(buffer.length / 160000));
    let sum = 0, peak = 0, samples = 0, crossings = 0, last = channels[0][0] || 0;
    for (let i = 0; i < buffer.length; i += stride) {
      let sample = 0;
      for (const channel of channels) sample += channel[i] || 0;
      sample /= channels.length;
      sum += sample * sample; peak = Math.max(peak, Math.abs(sample)); samples += 1;
      if ((sample >= 0) !== (last >= 0)) crossings += 1;
      last = sample;
    }
    const rms = Math.sqrt(sum / Math.max(1, samples));
    const sampledDuration = samples * stride / buffer.sampleRate;
    return {
      loudness: 20 * Math.log10(Math.max(rms, 1e-8)),
      peak: 20 * Math.log10(Math.max(peak, 1e-8)),
      frequency: crossings / Math.max(.001, sampledDuration * 2),
      duration: buffer.duration
    };
  }

  function compareSounds() {
    if (!compareBefore || !compareAfter) return;
    setHeader(2, 'process');
    stage.innerHTML = `<article class="tool-panel process-panel" style="top:85px"><h3>Comparing sounds</h3><p>Measuring level, peaks, duration, and frequency activity.</p><div class="process-track"><div class="process-fill" id="compare-fill" style="width:22%"></div></div><div class="process-value" id="compare-value">Reading waveforms</div></article>`;
    requestAnimationFrame(() => {
      const fill = document.getElementById('compare-fill');
      const value = document.getElementById('compare-value');
      fill.style.width = '66%'; value.textContent = 'Calculating differences';
      setTimeout(() => {
        const before = analyzeAudio(compareBefore.buffer);
        const after = analyzeAudio(compareAfter.buffer);
        fill.style.width = '100%'; value.textContent = 'Complete';
        localStorage.setItem('soundCompareResult', JSON.stringify({ completedAt: new Date().toISOString(), before, after }));
        setTimeout(() => renderCompareResult(before, after), 250);
      }, reducedMotion.matches ? 0 : 650);
    });
  }

  function renderCompareResult(before, after) {
    setHeader(2, 'result');
    const dbChange = after.loudness - before.loudness;
    const peakChange = after.peak - before.peak;
    const frequencyChange = after.frequency - before.frequency;
    const durationChange = after.duration - before.duration;
    const signed = (value, suffix, digits = 1) => `${value >= 0 ? '+' : ''}${value.toFixed(digits)}${suffix}`;
    const summary = Math.abs(dbChange) < 1 ? 'The overall loudness is nearly unchanged.' : `The after recording is ${Math.abs(dbChange).toFixed(1)} dB ${dbChange > 0 ? 'louder' : 'quieter'}.`;
    stage.innerHTML = `
      <article class="tool-panel compare-results"><h3>Comparison result</h3>
        <div class="compare-row"><span>Average loudness</span><strong>${after.loudness.toFixed(1)} dB</strong><em>${signed(dbChange,' dB')}</em></div>
        <div class="compare-row"><span>Peak level</span><strong>${after.peak.toFixed(1)} dB</strong><em>${signed(peakChange,' dB')}</em></div>
        <div class="compare-row"><span>Frequency estimate</span><strong>${Math.round(after.frequency)} Hz</strong><em>${signed(frequencyChange,' Hz',0)}</em></div>
        <div class="compare-row"><span>Duration</span><strong>${formatDuration(after.duration)}</strong><em>${signed(durationChange,' sec')}</em></div>
        <div class="compare-summary">${summary} Frequency is estimated from zero crossings and works best with simple tones.</div>
      </article>
      <div class="tool-actions"><button class="tool-primary" id="compare-finish" type="button">Finish</button><button class="tool-secondary" id="compare-again" type="button">Compare another pair</button></div>`;
    document.getElementById('compare-finish').addEventListener('click', () => { resetCompareSession(); closeTool(); });
    document.getElementById('compare-again').addEventListener('click', () => { resetCompareSession(); renderCompareReady(); });
  }

  function resetCompareSession() {
    if (compareBeforeUrl) URL.revokeObjectURL(compareBeforeUrl);
    if (compareAfterUrl) URL.revokeObjectURL(compareAfterUrl);
    compareBeforeUrl = ''; compareAfterUrl = ''; compareBefore = null; compareAfter = null;
  }

  function audioBufferToWav(buffer) {
    const channels = buffer.numberOfChannels;
    const length = buffer.length * channels * 2 + 44;
    const array = new ArrayBuffer(length);
    const view = new DataView(array);
    const write = (offset, text) => { for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i)); };
    write(0, 'RIFF'); view.setUint32(4, length - 8, true); write(8, 'WAVE'); write(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
    view.setUint32(24, buffer.sampleRate, true); view.setUint32(28, buffer.sampleRate * channels * 2, true);
    view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, length - 44, true);
    const data = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel));
    let offset = 44;
    for (let sampleIndex = 0; sampleIndex < buffer.length; sampleIndex += 1) {
      for (let channel = 0; channel < channels; channel += 1) {
        const sample = Math.max(-1, Math.min(1, data[channel][sampleIndex]));
        view.setInt16(offset, sample < 0 ? sample * 32768 : sample * 32767, true); offset += 2;
      }
    }
    return array;
  }

  let toolPointerX = null;
  let suppressToolOpen = false;
  card.addEventListener('pointerdown', event => { toolPointerX = event.clientX; });
  card.addEventListener('pointerup', event => {
    suppressToolOpen = toolPointerX !== null && Math.abs(event.clientX - toolPointerX) > 12;
    toolPointerX = null;
    if (suppressToolOpen) setTimeout(() => { suppressToolOpen = false; }, 0);
  });
  card.addEventListener('click', () => { if (!suppressToolOpen) openTool(index); });
  card.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openTool(index); }
  });
  document.querySelectorAll('[data-home-tool]').forEach(button => {
    button.addEventListener('click', () => openTool(Number(button.dataset.homeTool)));
  });
  back.addEventListener('click', () => {
    if (toolView === 'ready') return closeTool();
    if (activeTool === 0) { stopCleaner(false); stopCustomCleaner(); return customCleanerFile ? renderCustomCleanerReady() : renderCleanerReady(); }
    if (activeTool === 1) {
      if (toolView === 'result' && noiseFile) {
        if (noiseResultUrl) URL.revokeObjectURL(noiseResultUrl);
        noiseResultUrl = '';
        noiseResultBuffer = null;
        return selectNoiseFile(noiseFile);
      }
      resetNoiseSession();
      return renderNoiseReady();
    }
    renderCompareReady();
  });
  noiseInput.addEventListener('change', () => { selectNoiseFile(noiseInput.files[0]); noiseInput.value = ''; });
  beforeInput.addEventListener('change', () => { selectCompareFile(beforeInput.files[0], 'before'); beforeInput.value = ''; });
  afterInput.addEventListener('change', () => { selectCompareFile(afterInput.files[0], 'after'); afterInput.value = ''; });
  window.SoundTools = {
    openTool,
    useAudioFile(tool, file) {
      if (!file) return;
      if (tool === 0) {
        stopCustomCleaner();
        if (customCleanerUrl) URL.revokeObjectURL(customCleanerUrl);
        customCleanerUrl = '';
        customCleanerFile = file;
        openTool(0);
        renderCustomCleanerReady();
        return;
      }
      if (tool === 1) { openTool(1); selectNoiseFile(file); return; }
      openTool(2); selectCompareFile(file, compareBefore ? 'after' : 'before');
    }
  };
})();
