/* Shared disclosure pattern, compatible with the UXP DOM. */
(() => {
  document.querySelectorAll('[data-disclosure]').forEach((button) => {
    const target=document.getElementById(button.dataset.disclosure);
    button.setAttribute('aria-controls',target.id);
    const toggle=()=>{
      target.hidden=!target.hidden;button.setAttribute('aria-expanded',String(!target.hidden));
      const mark=button.querySelector('span');if(mark) mark.textContent=target.hidden ? '+':'−';
    };
    button.addEventListener('click',toggle);
    button.addEventListener('keydown',(event)=>{if(event.key==='Enter' || event.key===' ') {event.preventDefault();toggle();}});
  });
})();
