const { traceExpression, printTrace } = require('./ast-tracer');
const { createDomainJexl, sampleContext } = require('../sample-domain');

async function runDemo() {
  const jexl = createDomainJexl();
  const expression =
    "applyAdjustment(sumPoints(candidates[.active == true]) + ageScore(user.age), manualAdjustment) > threshold ? segmentLabel(user.country) : 'review'";

  const traced = await traceExpression({
    jexl,
    expression,
    context: sampleContext,
  });

  console.log('='.repeat(80));
  console.log('Propuesta 1 - Trazado por AST (single pass)');
  console.log('='.repeat(80));
  console.log('Expresion:', traced.expression);
  console.log('Resultado final:', traced.result);
  console.log('\nArbol de evaluacion:\n');
  printTrace(traced.trace);
  console.log('\nCantidad de nodos evaluados:', traced.flatTrace.length);
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
