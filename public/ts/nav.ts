(() => {
  let open = false
  const visibleClass = "nav--visible"
  const btn = document.querySelector(".nav__btn")
  const nav = document.querySelector('[data-js=nav]')
  function rerender() {
    if(btn)
      btn.innerHTML = open ? "<" : ">"

      // Prevent click-chatcher from reopening navigation
      if(open) nav.classList.add(visibleClass)
      else nav.classList.remove(visibleClass)
    }
  function handle() {
    open = !open
    rerender()
  }
    
    
  if(!open) btn.classList.remove(visibleClass)
  btn&&btn.addEventListener('click', handle, {passive: true})
  document.addEventListener("click", e => {
    // nav && btn && e.target !== nav && e.target !== btn
    if(e.target === document.body) {
      open = false
      rerender()
    }
  })

  if(!btn) throw new Error(`[NAV]: Button not found`)
  if(!nav) throw new Error(`[NAV]: Nav not found`)
})()