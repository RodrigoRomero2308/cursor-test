const { Jexl } = require('jexl');

function createFunctionTraceRuntime({ functions = {}, transforms = {} }) {
  return {
    async evalWithTrace(expression, context = {}) {
      const jexl = new Jexl();
      const calls = [];
      let callId = 0;

      for (const [name, fn] of Object.entries(functions)) {
        jexl.addFunction(name, async (...args) => {
          const call = {
            id: `fn-${++callId}`,
            pool: 'functions',
            name,
            args,
          };
          calls.push(call);
          call.result = await fn(...args);
          return call.result;
        });
      }

      for (const [name, fn] of Object.entries(transforms)) {
        jexl.addTransform(name, async (...args) => {
          const call = {
            id: `tf-${++callId}`,
            pool: 'transforms',
            name,
            args,
          };
          calls.push(call);
          call.result = await fn(...args);
          return call.result;
        });
      }

      const result = await jexl.eval(expression, context);

      return {
        expression,
        result,
        calls,
      };
    },
  };
}

function printCalls(calls) {
  for (const call of calls) {
    console.log(
      `- ${call.id} ${call.pool}.${call.name}(${call.args
        .map((arg) => JSON.stringify(arg))
        .join(', ')}) => ${JSON.stringify(call.result)}`
    );
  }
}

module.exports = {
  createFunctionTraceRuntime,
  printCalls,
};
