(() => {
  const ROOT_ID='wallet-account-carousel';let timers=[];
  function center(root){const viewport=root?.querySelector('.wallet-viewport'),track=root?.querySelector('.wallet-track');if(!viewport||!track)return;const cards=[...track.children];if(!cards.length)return;const index=Math.max(0,cards.findIndex(card=>card.classList.contains('active')));const card=cards[index];const width=card.getBoundingClientRect().width;const gap=parseFloat(getComputedStyle(track).gap)||10;const inset=Math.max(0,(viewport.clientWidth-width)/2);track.style.transition='none';track.style.transform=`translate3d(${inset-index*(width+gap)}px,0,0)`}
  function stabilize(){const root=document.getElementById(ROOT_ID);if(!root)return;center(root);requestAnimationFrame(()=>center(root))}
  function boot(){timers.forEach(clearTimeout);timers=[0,30,100,250,500,900].map(ms=>setTimeout(stabilize,ms));window.addEventListener('pageshow',stabilize);window.addEventListener('resize',stabilize)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
