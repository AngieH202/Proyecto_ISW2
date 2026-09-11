# ADR-002: Sacrificar simplicidad interna para mejorar la experiencia del usuario

- **Estado:** aceptada
- **Fecha:** 2026-09-10
- **Relacionada:** [ADR-001 — evolución](ADR-001-evolucion.md)

## Contexto

La primera versión de DentaAgenda era más sencilla internamente porque gran parte de la aplicación estaba concentrada en HTML, CSS y JavaScript.

Al agregar nuevas funciones y organizar mejor el proyecto, fue necesario aumentar la cantidad de componentes y partes que se deben mantener.

## Decisión

Se decidió aceptar una mayor complejidad interna para poder ofrecer una aplicación más completa y útil para la doctora y los pacientes.

Se priorizó que el usuario final tuviera una experiencia sencilla, aunque esto significara que el proyecto fuera más elaborado internamente.

Entre las mejoras se incluyeron el Landing Page para explicar la aplicación de forma más clara, la posibilidad de cancelar citas para los pacientes y una mejor organización de la información.

## Consecuencias

El principal sacrificio fue perder parte de la simplicidad que tenía la primera versión del proyecto. Ahora existen más partes que deben mantenerse y coordinarse.

Sin embargo, este sacrificio valió la pena porque las nuevas funciones responden mejor a las necesidades de los usuarios.

Para los pacientes, poder cancelar una cita evita tener que depender de la doctora para realizar esta acción y el Landing Page les permite entender más fácilmente qué ofrece DentaAgenda.

Para la doctora, la evolución permite contar con una herramienta más completa para administrar su trabajo diario.

La decisión también permite que el proyecto pueda continuar creciendo sin tener que reconstruirlo desde cero cada vez que se necesite agregar una nueva función.

### Cómo se sostiene esa complejidad

Que haya más partes no significa que se controlen solas. Lo que mantiene manejable esa complejidad es la suite de pruebas: 149 casos que corren en cada cambio y cubren el 93% de las líneas de la aplicación. Sin eso, agregar una función nueva pondría en riesgo las anteriores y el sacrificio no habría valido la pena.
