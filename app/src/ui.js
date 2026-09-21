// retryFn, when given, adds a tappable "Retry" button to the toast so a
// failed save can be re-attempted right there instead of hunting for the
// original button. Error toasts also stay up longer than success ones --
// 1.8s is fine for a confirmation, not enough time to read a failure
// outdoors and decide what to do about it.
export function showToast(msg, isErr, retryFn){
  const t = document.getElementById('toast');
  t.innerHTML = '';
  const span = document.createElement('span');
  span.textContent = msg;
  t.appendChild(span);
  if(retryFn){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-retry';
    btn.textContent = 'Retry';
    btn.onclick = ()=>{ t.classList.remove('show'); retryFn(); };
    t.appendChild(btn);
  }
  t.style.background = isErr ? 'var(--danger)' : 'var(--green)';
  t.classList.add('show');
  clearTimeout(t._hideTimer);
  const duration = retryFn ? 6000 : (isErr ? 3200 : 1800);
  t._hideTimer = setTimeout(()=>t.classList.remove('show'), duration);
}

export function renderPennants(){
  const el = document.getElementById('pennants');
  el.innerHTML = Array.from({length:14}).map(()=>'<span></span>').join('');
}

// Proactive offline warning -- shows a banner and toast the moment the
// connection drops, rather than only finding out via a failed save.
export function initConnectionBanner(){
  const el = document.getElementById('connBanner');
  if(!el) return;
  const update = ()=>{ el.style.display = navigator.onLine ? 'none' : 'block'; };
  window.addEventListener('online', ()=>{ update(); showToast('Back online'); });
  window.addEventListener('offline', ()=>{ update(); showToast('You are offline — scores will not save', true); });
  update();
}
