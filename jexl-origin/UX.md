# Propuestas de UX para navegar origen de datos en formulas JEXL

## Objetivo de producto

Queremos que un usuario tecnico:

- escriba una formula
- la ejecute
- pueda navegar subpartes
- entienda de donde sale cada resultado

Y al mismo tiempo que esa informacion pueda ser compartida con alguien no tecnico sin obligarlo a leer ASTs ni sintaxis.

---

## Principio general

No mostraria siempre la expresion como un bloque de texto sin estructura.

La separaria en **tres niveles de lectura**:

1. **Resultado final**
2. **Pasos / subresultados**
3. **Detalle tecnico fino**

Eso evita que la interfaz sea demasiado "de debugger" para todos los casos.

---

## Propuesta A - Formula inline con highlight navegable

### Layout

- arriba: resultado final
- centro: formula renderizada con highlights por subexpresion
- lateral derecho: detalle del nodo seleccionado

### Interaccion

- hover sobre una subexpresion => resalta ese fragmento
- click => muestra:
  - valor calculado
  - tipo de nodo
  - argumentos
  - funciones involucradas
  - datos de entrada usados

### Ejemplo conceptual

```txt
applyAdjustment(sumPoints(candidates[.active == true]) + ageScore(user.age), manualAdjustment) > threshold
```

El usuario hace click en:

- `candidates[.active == true]`
- `sumPoints(...)`
- `ageScore(user.age)`
- `applyAdjustment(...)`

y ve el valor de cada una.

### Para quien sirve

- autores tecnicos de formulas
- debugging
- soporte avanzado

### Riesgo

Si no usas pasos nombrados, una formula larga puede volverse dificil de recorrer.

---

## Propuesta B - Arbol de evaluacion + panel de explicacion

### Layout

- izquierda: arbol expandible
- derecha: panel de detalle

### Nodo mostrado como

- etiqueta de subexpresion
- valor
- estado visual:
  - evaluado
  - short-circuit
  - filtrado
  - error

### Ejemplo de nodos

- `decision`
  - `adjustedScore > threshold`
  - `segmentLabel(user.country)`
  - `candidates[.active == true]`

### Valor diferencial

Es la mejor interfaz para una implementacion tipo `01-ast-trace`.

### Para quien sirve

- equipos tecnicos
- auditoria
- soporte de segundo nivel

### Riesgo

Puede ser demasiado tecnica para usuarios que solo quieren explicar "por que dio ese perfil".

---

## Propuesta C - Vista por pasos nombrados (recomendada para negocio)

### Layout

- tarjeta 1: resultado final
- debajo: lista de pasos
- cada paso muestra:
  - nombre amigable
  - formula
  - valor
  - de que pasos depende

### Ejemplo

1. **Puntos por candidatos activos** = 7
2. **Componente de edad** = 4
3. **Score bruto** = 11
4. **Score ajustado** = 12
5. **Decision** = `perfil-local`

### Ventajas

- es mucho mas explicable
- se puede exportar a PDF o a una vista de negocio
- es compatible con mostrar formulas complejas sin obligar a leer toda la expresion

### Para quien sirve

- usuarios tecnicos que necesitan explicar a otros
- stakeholders no tecnicos
- auditoria funcional

### Mi recomendacion

Que esta sea la vista principal.

Y que desde cada paso exista un link tipo:

**"Ver detalle tecnico"**

que abre la vista A o B.

---

## Propuesta D - Timeline de funciones custom

### Layout

Tabla o timeline con columnas:

- orden
- funcion
- argumentos
- resultado
- duracion

### Ejemplo

| # | Funcion | Args | Resultado |
|---|---------|------|-----------|
| 1 | `sumPoints` | `[...items]` | `7` |
| 2 | `ageScore` | `42` | `4` |
| 3 | `applyAdjustment` | `11, 1` | `12` |
| 4 | `segmentLabel` | `"AR"` | `"perfil-local"` |

### Para quien sirve

- observabilidad
- debugging de funciones custom
- detectar cuellos de botella

### Buena combinacion

Muy buena como pestaña secundaria si implementas tracing de funciones.

---

## Flujo UX recomendado

## Vista primaria

**Resumen por pasos nombrados**

Porque:

- es la mas explicable
- soporta compartir con gente no tecnica
- evita mostrar internals innecesarios

## Vista secundaria

**Detalle tecnico por nodo / por AST**

Porque:

- sirve para debug real
- mantiene contento al usuario tecnico

## Vista terciaria

**Timeline de funciones**

Porque:

- agrega valor operativo
- ayuda a performance y soporte

---

## Recomendaciones puntuales de micro-UX

- mostrar siempre el **resultado final** fijo arriba
- usar colores distintos para:
  - booleanos
  - strings
  - numeros
  - arrays filtrados
- permitir copiar:
  - formula
  - resultado
  - detalle del paso
- mostrar tooltip con:
  - valor
  - tipo
  - fuente
- en filtros, mostrar:
  - cuantos items entraron
  - cuantos pasaron
  - por que se excluyo cada item

---

## Si tuviera que elegir una sola UX inicial

Haria esta combinacion:

1. **Vista por pasos nombrados** como default
2. **Drill-down tecnico** por click en cada paso
3. **Timeline de funciones** como tab adicional

Eso te da:

- buena explicabilidad
- buena performance
- bajo acoplamiento con internals de JEXL
- una progresion natural de simple -> tecnico
