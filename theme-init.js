/* Runs in <head> before first paint so a saved light/dark choice never flashes. */
(function(){
  try{
    var t = localStorage.getItem('pc_theme');
    if(t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  }catch(e){}
})();
