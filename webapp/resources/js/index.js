// Función para mostrar el aviso de próximamente
function showComingSoonAlert() {
  const modal = document.getElementById('comingSoonModal');
  if (modal) {
    modal.classList.remove('closing');
    modal.classList.add('active');
  }
}

// Función para cerrar el aviso con animación
function closeComingSoonAlert() {
  const modal = document.getElementById('comingSoonModal');
  if (modal) {
    modal.classList.add('closing');
    setTimeout(() => {
      modal.classList.remove('active');
      modal.classList.remove('closing');
    }, 120);
  }
}

// Cerrar el modal cuando se hace click fuera de él
document.addEventListener('DOMContentLoaded', function() {
  const modal = document.getElementById('comingSoonModal');
  if (modal) {
    const backdrop = modal.querySelector('.modal-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', function() {
        closeComingSoonAlert();
      });
    }
  }
});
