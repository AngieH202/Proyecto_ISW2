# ADR-001: Evolución de DentaAgenda para mejorar su facilidad de uso

- **Estado:** aceptada
- **Fecha:** 2026-09-10
- **Relacionada:** [ADR-002 — autenticación](ADR-002-auth.md)

## Contexto

La primera versión de DentaAgenda fue desarrollada utilizando principalmente HTML, CSS y JavaScript. Esta versión ya contaba con las funciones principales para gestionar las citas y con una base de datos.

Durante el desarrollo del proyecto identificamos nuevas necesidades para mejorar la experiencia de la doctora y de los pacientes.

En la nueva versión se decidió continuar con el proyecto, pero realizando mejoras tanto en su organización como en la forma en que los usuarios interactúan con la aplicación.

Entre las principales mejoras se agregó un Landing Page, con el objetivo de explicar de una manera más clara qué es DentaAgenda y facilitar que los usuarios comprendan cómo utilizarla.

También se agregó la consulta del estado de la cita: el paciente ingresa su número de identidad y ve si su cita está pendiente, confirmada, atendida o cancelada, sin tener que llamar a la clínica para averiguarlo.

Sobre esa misma pantalla se agregó la posibilidad de que los pacientes puedan cancelar sus propias citas, función que no estaba disponible en la primera versión. Antes, quien no podía venir tenía que llamar a la clínica, y mientras tanto su horario seguía bloqueado para todos los demás.

Además, inicialmente la aplicación se encontraba disponible mediante el dominio gratuito proporcionado por Vercel. Como parte de la evolución del proyecto, se buscó mejorar la presentación y la forma en que los usuarios pueden acceder a la aplicación.

## Decisión

Se decidió evolucionar la primera versión de DentaAgenda, manteniendo las funciones que ya eran útiles y agregando mejoras que respondieran a las necesidades identificadas durante el desarrollo.

La prioridad fue mantener una aplicación sencilla de entender y utilizar, tanto para la doctora como para los pacientes.

Por esta razón, se agregó un Landing Page que presenta la aplicación antes de ingresar a ella, y se incorporaron la consulta del estado de la cita y la cancelación por parte del paciente, para dar mayor claridad y control a los pacientes.

La cancelación se resolvió con un estado propio, `cancelada_paciente`, separado del que usa la doctora cuando rechaza una solicitud. Los dos liberan el horario, pero distinguir quién canceló importa: a la doctora no le da lo mismo una solicitud que ella rechazó que un paciente que se dio de baja, porque lo segundo le deja un hueco en una agenda que ya daba por llena.

También se decidió organizar mejor el proyecto para facilitar futuras mejoras, sin cambiar el objetivo principal de DentaAgenda: ayudar a la doctora a gestionar sus citas y facilitar a los pacientes el proceso de solicitar y consultar sus citas.

## Consecuencias

La nueva versión ofrece una experiencia más completa que la primera.

Los pacientes pueden comprender más fácilmente el propósito de la aplicación gracias al Landing Page, y ahora pueden consultar el estado de su cita y cancelarla cuando lo necesiten, sin llamar a la clínica.

Para la doctora, esa cancelación no es sólo un aviso: el horario se libera solo y otro paciente puede tomarlo enseguida, en vez de quedar bloqueado hasta que alguien se acuerde de avisarle.

La doctora cuenta con una aplicación que continúa enfocándose en facilitar la gestión de sus citas, sin agregar procesos innecesarios.

Como consecuencia, el proyecto requiere una mayor organización interna que la primera versión, pero esta evolución permite agregar nuevas funciones y mejorar la experiencia de los usuarios sin perder la sencillez que se buscaba desde el inicio.

### Qué queda pendiente

El paciente se identifica sólo con su número de identidad, sin contraseña. Es lo que mantiene el flujo simple —pedirle una cuenta haría que varios prefieran llamar por teléfono—, pero significa que quien conozca la identidad de otra persona puede ver y cancelar sus citas. Para el tamaño de esta clínica se aceptó el riesgo; si el sistema crece, ese es el primer punto a revisar.
