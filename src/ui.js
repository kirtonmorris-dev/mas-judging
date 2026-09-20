export function showToast(msg, isErr){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.background = isErr ? 'var(--danger)' : 'var(--green)';
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 1800);
}

export function renderPennants(){
  const el = document.getElementById('pennants');
  el.innerHTML = Array.from({length:14}).map(()=>'<span></span>').join('');
}
