(() => {
  const fileInput = document.getElementById('fileInput');
  const bmpImage = document.getElementById('bmpImage');
  const placeholder = document.getElementById('placeholder');
  const startStopBtn = document.getElementById('startStopBtn');
  const speedControl = document.getElementById('speed');
  const ampControl = document.getElementById('amplitude');

  let animating = false;
  let rafId = null;
  let t = 0;
  let baseScale = 1;
  let speed = parseFloat(speedControl.value);
  let amplitude = parseFloat(ampControl.value);

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      bmpImage.src = reader.result;
      bmpImage.style.display = '';
      placeholder.style.display = 'none';
    };
    reader.onerror = () => { alert('ไม่สามารถโหลดไฟล์ได้'); };
    reader.readAsDataURL(file);
  });

  startStopBtn.addEventListener('click', () => {
    if (!bmpImage.src) { alert('ยังไม่มีภาพ เลือกไฟล์ .bmp ก่อนเริ่ม'); return; }
    animating = !animating;
    startStopBtn.textContent = animating ? 'Stop' : 'Start';
    if (animating) { t = 0; loop(); } else { if (rafId) cancelAnimationFrame(rafId); rafId = null; bmpImage.style.transform = `translate(-50%, -50%) scale(${baseScale})`; }
  });

  speedControl.addEventListener('input', () => { speed = parseFloat(speedControl.value); });
  ampControl.addEventListener('input', () => { amplitude = parseFloat(ampControl.value); });

  function loop() {
    const dt = 1 / 60;
    t += dt * speed * 2;
    const sinv = Math.sin(t);
    const s = baseScale + amplitude * sinv;
    bmpImage.style.transform = `translate(-50%, -50%) scale(${s.toFixed(4)})`;
    rafId = requestAnimationFrame(loop);
  }

  const viewport = document.querySelector('.viewport');
  viewport.addEventListener('dragover', (e) => { e.preventDefault(); viewport.classList.add('drag-over'); });
  viewport.addEventListener('dragleave', () => { viewport.classList.remove('drag-over'); });
  viewport.addEventListener('drop', (e) => {
    e.preventDefault();
    viewport.classList.remove('drag-over');
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f) return;
    if (!f.type.includes('bmp') && !f.name.toLowerCase().endsWith('.bmp')) { alert('รองรับเฉพาะไฟล์ .bmp เท่านั้น'); return; }
    const r = new FileReader();
    r.onload = () => { bmpImage.src = r.result; bmpImage.style.display = ''; placeholder.style.display = 'none'; };
    r.readAsDataURL(f);
  });

  window.addEventListener('blur', () => { if (animating && rafId) { cancelAnimationFrame(rafId); rafId = null; } });
  window.addEventListener('focus', () => { if (animating && !rafId) loop(); });

})();