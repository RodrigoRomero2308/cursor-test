# JEXL - Iteración de arreglos (PoC)

## ¿Qué problema estamos resolviendo?

[JEXL](https://github.com/TomFrost/Jexl) es una librería de expresiones para JavaScript que permite evaluar expresiones dinámicas con contexto. Sin embargo, **no tiene soporte nativo para iterar sobre arreglos** de forma que permita:

- Procesar cada item con una expresión JEXL
- Modificar o enriquecer objetos (agregar campos calculados)
- Usar variables del contexto global dentro de la iteración
- Encadenar fórmulas custom con lógica condicional

El filter nativo (`arr[.prop == "x"]`) permite filtrar, pero no transformar. Este PoC explora formas de implementar un "for loop" conceptual en JEXL.

## Solución propuesta

Se implementa una función **`map`** que recibe un arreglo y una expresión JEXL, evaluando la expresión para cada item con las siguientes convenciones:

- **`value`**: el item actual del arreglo
- **Contexto global**: todas las variables del contexto están disponibles en la expresión

Además, se agregan funciones utilitarias para enriquecer objetos:

- **`addField(obj, fieldName, fieldValue)`**: agrega un campo a un objeto
- **`addFields(obj, fields)`**: agrega múltiples campos a la vez
- **`calcularConImpuesto(valor, multiplicador)`**: ejemplo de fórmula custom

### Ejemplo: agregar total = value × multiplier

```javascript
map(items, "addField(value, 'total', value.value * value.multiplier)")
```

### Ejemplo: fórmula custom + categoría condicional

```javascript
map(items, "addFields(value, {
  total: calcularConImpuesto(value.value, value.multiplier),
  categoria: calcularConImpuesto(value.value, value.multiplier) > 100 ? 'alto' : 'bajo'
})")
```

## Requisitos

- Node.js 18+ (para el runner de tests nativo)

## Instalación

```bash
cd jexl-tests
npm install
```

## Cómo ejecutar

### Tests

```bash
npm test
```

### Demostración interactiva (PoC)

```bash
npm run poc
```

Muestra en consola todos los casos de uso con ejemplos de salida.

## Estructura

```
jexl-tests/
├── jexl-array-iteration.js      # PoC con implementación y demos
├── jexl-array-iteration.test.js # Tests
├── package.json
└── README.md
```

## Otras propuestas en el PoC

Además de `map`, el archivo incluye:

- **mapTransform**: transform con sintaxis pipe (`arr|mapTransform("value * 2")`)
- **forEach**: igual que map pero con `index` en el contexto
- **reduce**: para agregaciones
- **iterate**: función unificada con `value`, `index` y `array`

La propuesta principal recomendada es **map + addField/addFields** por su flexibilidad y acceso al contexto global.
