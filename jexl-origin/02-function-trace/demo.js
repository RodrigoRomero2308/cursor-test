const { createFunctionTraceRuntime, printCalls } = require('./function-trace');
const { domainFunctions, sampleContext } = require('../sample-domain');

async function runDemo() {
  const runtime = createFunctionTraceRuntime({
    functions: domainFunctions,
  });

  const expression =
    "applyAdjustment(sumPoints(candidates[.active == true]) + ageScore(user.age), manualAdjustment) > threshold ? segmentLabel(user.country) : 'review'";

  const traced = await runtime.evalWithTrace(expression, sampleContext);

  console.log('='.repeat(80));
  console.log('Propuesta 2 - Trazado de funciones custom');
  console.log('='.repeat(80));
  console.log('Expresion:', traced.expression);
  console.log('Resultado final:', traced.result);
  console.log('\nLlamadas capturadas:\n');
  printCalls(traced.calls);
}

if (require.main === module) {
  runDemo().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  runDemo,
};
