DentaAgenda
Es una aplicación web progresiva (PWA) que permite a una clínica odontológica unipersonal gestionar sus citas de forma digital, eliminando el caos de agendar por WhatsApp y las llegadas simultáneas de pacientes sin hora asignada.

Cliente real

Dra. Belkis Julissa Suisse — Odontóloga independiente  
Sector el Ocotillo, San Pedro Sula, Cortés, Honduras  
Entrevistada el 28 de mayo de 2026.

"Yo agendo las citas por WhatsApp, pero cuando estoy atendiendo no puedo estar viendo el celular, y a veces llegan dos o tres personas el mismo día a la misma hora sin saber que hay alguien antes."

Funcionalidades:
Vista Doctora
- Login con usuario y contraseña
- Agenda del día con estadísticas (confirmadas, atendidas, pendientes)
- Confirmación o rechazo de solicitudes de cita
- Marcar citas como atendidas o "no se presentó"
- Expediente completo por paciente con historial de visitas
- Registro de diagnóstico, tratamientos y medicamentos por visita

Vista Paciente
- Ingreso con datos personales 
- Calendario de horarios disponibles en tiempo real
- Solicitud de cita con motivo o síntomas
- Consulta del estado de la cita con solo el número de identidad

Tecnologías:
Frontend : HTML + CSS + JavaScript vanilla | PWA sin instalación, funciona en celular básico |
Base de datos : Supabase (PostgreSQL) | Gratuito, API REST lista, sin servidor propio |
Autenticación : Supabase Auth | Login seguro para la doctora |
Hosting : Vercel | Deploy gratuito con HTTPS y dominio público |

Estructura del proyecto:
DentaAgenda/
├── index.html      ← Aplicación completa (HTML + CSS + JS)
├── README.md       ← Descripción del proyecto


Cómo usar

1. Abrí el link de producción en el navegador de tu celular o computadora
2. Selecciona si sos Doctora o Paciente
3. Doctora: usuario belki.den / contraseña :dental123
4. Paciente: ingresa tus datos y agenda tu cita


> Link disponible en Vercel

Desarrolladora

Angie Hernández — Estudiante de Ingeniería en Sistemas  
CEUTEC — Ingeniería de Software I  
San Pedro Sula, Honduras · 2026
