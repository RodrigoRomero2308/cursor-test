# JEXL Origin - PoCs para origen de datos y resultados parciales

## Pregunta que responde este directorio

> "¿Existe algo como ver los resultados parciales de los nodos del AST de una expresion JEXL?"

### Respuesta corta

**En el JEXL de JavaScript (`jexl` 2.3.0), no hay una API publica y lista para usar de tracing/debug por nodo.**

Lo que si existe es:

- una expresion compilada con AST interno (`expr._getAst()`)
- un evaluador interno que recorre ese AST

Lo que **no** existe de forma publica/nativa:

- un "debugger" de resultados parciales por nodo
- offsets/rangos de texto por nodo para saber exactamente que substring correspondia a cada evaluacion
- memoizacion de subexpresiones repetidas

En otras palabras: **se puede hacer**, pero **hay que construir la capa de tracing vos**.

---

## Hallazgos principales

### 1. JEXL si expone el AST, pero por API privada

Internamente, JEXL compila la expresion y guarda el AST en `Expression._ast`, accesible via `_getAst()`.

Eso habilita dos estrategias:

- inspeccionar el arbol
- evaluarlo con una capa propia que vaya registrando resultados parciales

### 2. No trae metadata de posiciones de texto

El AST no viene con `loc`, `start`, `end`, `range`, etc.

Consecuencia:

- podes saber **que nodo** se evaluo
- podes reconstruir una **representacion canonica** de la subexpresion
- pero no podes mapear de forma exacta y estable al substring original sin trabajo adicional

### 3. El costo grande no es solo "compilar de nuevo"

Si hoy rearmas y reejecutas subexpresiones para mostrar origen del dato, el problema no es solo performance de parse/compile. Tambien hay:

- reejecucion de funciones custom
- recomputo de filtros
- potenciales diferencias si alguna funcion es async, remota o no completamente pura

### 4. Si queres explicabilidad fuerte, JEXL solo no alcanza

JEXL es bueno como **motor de expresiones**.

No es tan bueno como:

- motor de trazabilidad
- motor de debugging
- lenguaje de explicaciones de negocio

Por eso, si el objetivo final es que el usuario pueda **navegar la formula**, ver **subresultados** y despues **explicarselos a otra persona**, conviene agregar una capa de producto encima y no depender solo del engine.

---

## Propuestas incluidas

## 1) `01-ast-trace/` - tracing por AST en una sola evaluacion

### Idea

Compilar la expresion una sola vez, tomar el AST interno y recorrerlo con un evaluador instrumentado que vaya guardando:

- tipo de nodo
- subexpresion renderizada
- resultado del nodo
- evaluaciones de filtros
- short-circuit de `&&` y `||`

### Que demuestra

- que **si es posible** obtener resultados parciales por nodo
- que no hace falta recompilar y reevaluar cada pedazo manualmente

### Ventajas

- maxima visibilidad
- sirve para operadores, condicionales, filtros y funciones
- permite construir una UI de inspeccion tecnica muy buena

### Desventajas

- depende de APIs privadas de JEXL (`_getAst`, `_grammar`)
- no trae posiciones exactas del texto original
- si la misma subexpresion aparece repetida en el AST, se evalua repetida
- requiere mantener una capa propia si cambias de version

### Cuando la usaria

- modo debug
- consola interna para soporte/analisis
- feature flag para cuentas avanzadas

---

## 2) `02-function-trace/` - tracing solo de funciones custom

### Idea

En vez de instrumentar el evaluador entero, envolver cada funcion custom y registrar:

- nombre
- argumentos
- resultado

### Ventajas

- muy simple
- bajo acoplamiento con JEXL
- robusto para produccion
- suele capturar justo lo que mas valor de negocio tiene

### Desventajas

- no ves operadores (`+`, `>`, `?:`, etc.)
- no ves cualquier subexpresion arbitraria
- no alcanza para una navegacion exhaustiva del AST

### Cuando la usaria

- observabilidad de negocio
- auditoria de formulas
- "source of truth" centrado en funciones de dominio

---

## 3) `03-named-steps/` - pasos nombrados (recomendacion principal)

### Idea

En vez de guardar una unica mega-formula opaca, dividirla en pasos con nombre:

```js
{
  activeCandidatePoints: "sumPoints(candidates[.active == true])",
  ageComponent: "ageScore(user.age)",
  rawScore: "activeCandidatePoints + ageComponent",
  adjustedScore: "applyAdjustment(rawScore, manualAdjustment)",
  decision: "adjustedScore > threshold ? segmentLabel(user.country) : 'review'"
}
```

### Ventajas

- cada paso se calcula una sola vez
- cache natural de subresultados
- UX mucho mejor
- explicabilidad mucho mejor
- no dependes de internals privados del engine

### Desventajas

- exige cambiar el modelo de authoring
- deja de ser una sola expresion "libre"
- requiere una capa de orquestacion encima

### Cuando la usaria

- producto real
- formulas importantes para negocio
- escenarios donde el usuario necesita explicar resultados

---

## Recomendacion honesta

### Mi ranking para produccion

1. **Pasos nombrados + tracing de funciones custom**
2. **AST trace** solo como herramienta interna o modo avanzado
3. Reejecutar subexpresiones sueltas como estrategia principal: **no lo recomendaria**

### Conclusion sobre si JEXL "es lo mejor"

**JEXL sigue siendo razonable** si:

- el lenguaje que queres ofrecer es expresivo pero acotado
- ya tenes funciones custom
- queres mantener baja la complejidad del parser

**No es ideal** si tu necesidad principal pasa a ser:

- observabilidad fina por nodo
- source maps del texto
- explicabilidad first-class
- versionado/auditoria avanzada de formulas

### Entonces, que haria yo

No migraria de JEXL inmediatamente.

Haria esto:

1. Mantener JEXL como motor de expresiones
2. Agregar tracing de funciones custom
3. Introducir pasos nombrados para formulas nuevas o importantes
4. Dejar AST tracing como feature interna de debugging

Solo pensaria en salir de JEXL si tu producto va camino a ser un **formula builder explicable** como capability central, no un simple motor de expresiones.

---

## Como ejecutar

```bash
cd jexl-origin
npm install
```

### Correr todos los PoCs

```bash
npm run poc
```

### Correr uno por uno

```bash
npm run ast-trace
npm run function-trace
npm run named-steps
npm test
```

---

## Archivos clave

- `01-ast-trace/ast-tracer.js`: evaluador instrumentado por AST
- `02-function-trace/function-trace.js`: wrappers de funciones custom
- `03-named-steps/named-steps.js`: ejecucion por pasos y grafo de dependencias
- `UX.md`: propuestas de interfaz

---

## Recomendacion de UX

La propuesta de UX detallada esta en `UX.md`, pero el resumen es:

- para gente tecnica: **formula + arbol navegable + side panel de resultados**
- para mostrar a gente no tecnica: **vista resumida por pasos nombrados**
- para soporte/debug: **timeline/trace de funciones**
