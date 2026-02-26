/**
 * PoC: Propuestas para implementar iteración tipo "for loop" en JEXL
 *
 * Objetivo: Tener una función que permita procesar item a item un arreglo,
 * realizando modificaciones y usando expresiones/funciones de JEXL dentro del loop.
 */

const Jexl = require('jexl').Jexl;

// =============================================================================
// CONTEXTO DE PRUEBA
// =============================================================================

const testContext = {
  numbers: [1, 2, 3, 4, 5],
  employees: [
    { first: 'Sterling', last: 'Archer', age: 36, active: true },
    { first: 'Lana', last: 'Kane', age: 33, active: true },
    { first: 'Cyril', last: 'Figgis', age: 45, active: false },
  ],
  items: [
    { key: 'a', value: 10, multiplier: 2 },
    { key: 'b', value: 5, multiplier: 3 },
    { key: 'c', value: 25, multiplier: 4 },
  ],
  prefix: 'Agent',
  retireAge: 62,
};

// =============================================================================
// PROPUESTA 1: Función map con closure sobre el contexto
// =============================================================================
/**
 * Crea una instancia de JEXL con la función map que tiene acceso al contexto
 * completo. La expresión usa "value" para referenciar el item actual.
 *
 * Ventajas:
 * - Acceso al contexto global (variables como prefix, retireAge)
 * - Sintaxis limpia: map(arr, "expr")
 * - Soporta async
 *
 * Desventajas:
 * - Requiere un wrapper que inyecte la función antes de evaluar
 * - "value" es una convención que el usuario debe conocer
 */
/**
 * Registra funciones utilitarias para enriquecer objetos dentro de map.
 * - addField(obj, fieldName, fieldValue): agrega un campo a un objeto
 * - addFields(obj, fields): agrega múltiples campos a un objeto
 * - calcularConImpuesto(valor, multiplicador): fórmula custom de ejemplo (valor * mult * 1.16)
 */
function addUtilityFunctions(jexl) {
  jexl.addFunction('addField', (obj, fieldName, fieldValue) => ({
    ...obj,
    [fieldName]: fieldValue,
  }));
  jexl.addFunction('addFields', (obj, fields) => ({
    ...obj,
    ...fields,
  }));
  jexl.addFunction('calcularConImpuesto', (valor, multiplicador) =>
    valor * multiplicador * 1.16
  );
  return jexl;
}

function createJexlWithMap() {
  const jexl = new Jexl();
  addUtilityFunctions(jexl);

  return {
    addMapFunction(context) {
      jexl.addFunction('map', async function (arr, exprStr) {
        if (!Array.isArray(arr)) return arr;
        const expr = jexl.createExpression(exprStr);
        const results = [];
        for (const item of arr) {
          const mergedContext = { ...context, value: item };
          const result = await expr.eval(mergedContext);
          results.push(result);
        }
        return results;
      });
      return jexl;
    },
    async evalWithMap(expression, context) {
      const jexl = this.addMapFunction(context);
      return jexl.eval(expression, context);
    },
  };
}

// =============================================================================
// PROPUESTA 2: Transform con expresión como string (solo "value")
// =============================================================================
/**
 * Transform que itera sobre un array. Más limitado: la expresión solo puede
 * usar "value" porque no tenemos forma de inyectar el contexto en un transform.
 *
 * Uso: arr|mapTransform("value * 2")
 */
function addMapTransform(jexl) {
  jexl.addTransform('mapTransform', function (arr, exprStr) {
    if (!Array.isArray(arr)) return arr;
    const expr = jexl.createExpression(exprStr);
    return arr.map((item) => expr.evalSync({ value: item }));
  });
}

// =============================================================================
// PROPUESTA 3: Función forEach que modifica items in-place
// =============================================================================
/**
 * Similar a map pero con capacidad de modificar objetos.
 * La expresión debe retornar el valor transformado.
 *
 * Uso: forEach(arr, "value * 2") o forEach(employees, "{...value, fullName: value.first + ' ' + value.last}")
 */
function createJexlWithForEach() {
  const jexl = new Jexl();

  return {
    addForEachFunction(context) {
      jexl.addFunction('forEach', async function (arr, exprStr) {
        if (!Array.isArray(arr)) return arr;
        const expr = jexl.createExpression(exprStr);
        const results = [];
        for (let i = 0; i < arr.length; i++) {
          const mergedContext = { ...context, value: arr[i], index: i };
          const result = await expr.eval(mergedContext);
          results.push(result);
        }
        return results;
      });
      return jexl;
    },
    async evalWithForEach(expression, context) {
      const jexl = this.addForEachFunction(context);
      return jexl.eval(expression, context);
    },
  };
}

// =============================================================================
// PROPUESTA 4: Función reduce para agregaciones
// =============================================================================
/**
 * Reduce/accumulate con expresión JEXL. Usa "accumulator" y "value" en el contexto.
 *
 * Uso: reduce(numbers, 0, "accumulator + value")
 */
function createJexlWithReduce() {
  const jexl = new Jexl();

  return {
    addReduceFunction(context) {
      jexl.addFunction('reduce', async function (arr, initial, exprStr) {
        if (!Array.isArray(arr)) return initial;
        const expr = jexl.createExpression(exprStr);
        let accumulator = initial;
        for (const item of arr) {
          const mergedContext = { ...context, accumulator, value: item };
          accumulator = await expr.eval(mergedContext);
        }
        return accumulator;
      });
      return jexl;
    },
    async evalWithReduce(expression, context) {
      const jexl = this.addReduceFunction(context);
      return jexl.eval(expression, context);
    },
  };
}

// =============================================================================
// PROPUESTA 5: Función unificada "iterate" con modo configurable
// =============================================================================
/**
 * Una sola función que puede actuar como map, filter o forEach según la expresión.
 * Incluye index en el contexto para mayor flexibilidad.
 *
 * Variables disponibles en la expresión:
 * - value: el item actual
 * - index: índice numérico (0-based)
 * - array: el array completo (referencia)
 */
function createJexlWithIterate() {
  const jexl = new Jexl();

  return {
    addIterateFunction(context) {
      jexl.addFunction('iterate', async function (arr, exprStr, options = {}) {
        if (!Array.isArray(arr)) return arr;
        const expr = jexl.createExpression(exprStr);
        const { filter = false } = options; // Si filter=true, solo incluye truthy

        const results = [];
        for (let i = 0; i < arr.length; i++) {
          const mergedContext = {
            ...context,
            value: arr[i],
            index: i,
            array: arr,
          };
          const result = await expr.eval(mergedContext);
          if (filter) {
            if (result) results.push(typeof result === 'object' ? result : arr[i]);
          } else {
            results.push(result);
          }
        }
        return results;
      });
      return jexl;
    },
    async evalWithIterate(expression, context) {
      const jexl = this.addIterateFunction(context);
      return jexl.eval(expression, context);
    },
  };
}

// =============================================================================
// EJECUCIÓN DE LAS PRUEBAS
// =============================================================================

async function runPoC() {
  console.log('='.repeat(70));
  console.log('PoC: Iteración de arreglos en JEXL');
  console.log('='.repeat(70));

  // --- Propuesta 1: map con contexto ---
  console.log('\n--- PROPUESTA 1: map con closure sobre contexto ---');
  const mapJexl = createJexlWithMap();
  const mapResult = await mapJexl.evalWithMap(
    'map(numbers, "value * 2")',
    testContext
  );
  console.log('map(numbers, "value * 2"):', mapResult);

  const mapNames = await mapJexl.evalWithMap(
    'map(employees, "prefix + \\": \\" + value.first + \\" \\" + value.last")',
    testContext
  );
  console.log('map(employees, "prefix + ..."):', mapNames);

  // --- Propuesta 2: Transform ---
  console.log('\n--- PROPUESTA 2: Transform mapTransform ---');
  const jexl2 = new Jexl();
  addMapTransform(jexl2);
  const transformResult = await jexl2.eval(
    'numbers|mapTransform("value * 3")',
    testContext
  );
  console.log('numbers|mapTransform("value * 3"):', transformResult);

  // --- Propuesta 3: forEach con index ---
  console.log('\n--- PROPUESTA 3: forEach con index ---');
  const forEachJexl = createJexlWithForEach();
  const forEachResult = await forEachJexl.evalWithForEach(
    'forEach(employees, "value.first + \\" (\\" + index + \\")\\"")',
    testContext
  );
  console.log('forEach(employees, "value.first + (index)"):', forEachResult);

  // --- Propuesta 4: reduce ---
  console.log('\n--- PROPUESTA 4: reduce ---');
  const reduceJexl = createJexlWithReduce();
  const sumResult = await reduceJexl.evalWithReduce(
    'reduce(numbers, 0, "accumulator + value")',
    testContext
  );
  console.log('reduce(numbers, 0, "accumulator + value"):', sumResult);

  // --- Propuesta 5: iterate unificado ---
  console.log('\n--- PROPUESTA 5: iterate unificado ---');
  const iterateJexl = createJexlWithIterate();
  const iterateResult = await iterateJexl.evalWithIterate(
    'iterate(employees, "value.first + \\" - \\" + value.last")',
    testContext
  );
  console.log('iterate(employees, "value.first + - + value.last"):', iterateResult);

  // Combinando con filter nativo de JEXL
  console.log('\n--- Combinando con filter nativo de JEXL ---');
  const filterThenMap = await mapJexl.evalWithMap(
    'map(employees[.active == true], "value.first + \\" \\" + value.last")',
    testContext
  );
  console.log('map(employees[.active == true], "value.first + value.last"):', filterThenMap);

  // Usando funciones JEXL dentro del map
  console.log('\n--- Usando contexto (retireAge) dentro del map ---');
  const withContext = await mapJexl.evalWithMap(
    'map(employees, "value.age >= retireAge ? \\"retired\\" : \\"working\\"")',
    testContext
  );
  console.log('map(employees, "value.age >= retireAge ? retired : working"):', withContext);

  // Modificando objetos: crear nuevos objetos con propiedades adicionales
  console.log('\n--- Modificando items: crear objetos enriquecidos ---');
  const enriched = await mapJexl.evalWithMap(
    'map(employees, "{first: value.first, last: value.last, fullName: value.first + \\" \\" + value.last, status: value.active ? \\"active\\" : \\"inactive\\"}")',
    testContext
  );
  console.log('map(employees, "{...enriched object}"):', JSON.stringify(enriched, null, 2));

  // addField: agregar total = value * multiplier
  console.log('\n--- addField: agregar campo total ---');
  const withTotal = await mapJexl.evalWithMap(
    'map(items, "addField(value, \\"total\\", value.value * value.multiplier)")',
    testContext
  );
  console.log('map(items, "addField(value, total, value.value * value.multiplier)"):', JSON.stringify(withTotal, null, 2));

  // addField con fórmula custom
  console.log('\n--- addField con fórmula custom (calcularConImpuesto) ---');
  const withImpuesto = await mapJexl.evalWithMap(
    'map(items, "addField(value, \\"totalConImpuesto\\", calcularConImpuesto(value.value, value.multiplier))")',
    testContext
  );
  console.log('map(items, "addField(value, totalConImpuesto, calcularConImpuesto(...))"):', JSON.stringify(withImpuesto, null, 2));

  // addFields: total + categoría condicional (usar addFields cuando el 2do campo depende del 1ro)
  console.log('\n--- addFields: total + categoría condicional ---');
  const withCategoria = await mapJexl.evalWithMap(
    'map(items, "addFields(value, {total: value.value * value.multiplier, categoria: value.value * value.multiplier > 50 ? \\"alto\\" : \\"bajo\\"})")',
    testContext
  );
  console.log('addFields con total y categoría:', JSON.stringify(withCategoria, null, 2));

  // addFields: múltiples campos a la vez
  console.log('\n--- addFields: múltiples campos ---');
  const withMultiple = await mapJexl.evalWithMap(
    'map(items, "addFields(value, {total: value.value * value.multiplier, categoria: value.value > 10 ? \\"A\\" : \\"B\\", procesado: true})")',
    testContext
  );
  console.log('addFields con total, categoria, procesado:', JSON.stringify(withMultiple, null, 2));

  console.log('\n' + '='.repeat(70));
  console.log('Resumen de convenciones:');
  console.log('- value: item actual del arreglo');
  console.log('- index: posición (en forEach/iterate)');
  console.log('- accumulator: valor acumulado (en reduce)');
  console.log('- Todas las variables del contexto están disponibles');
  console.log('='.repeat(70));
}

// Exportar para tests
module.exports = {
  Jexl,
  createJexlWithMap,
  addUtilityFunctions,
  addMapTransform,
  createJexlWithForEach,
  createJexlWithReduce,
  createJexlWithIterate,
  testContext,
};

// Ejecutar PoC si se corre directamente
if (require.main === module) {
  runPoC().catch(console.error);
}
