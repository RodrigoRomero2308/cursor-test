function getNodeChildren(ast) {
  if (!ast || typeof ast !== 'object') return [];

  switch (ast.type) {
    case 'ArrayLiteral':
      return ast.value;
    case 'BinaryExpression':
      return [ast.left, ast.right];
    case 'ConditionalExpression':
      return [ast.test, ast.consequent, ast.alternate].filter(Boolean);
    case 'FilterExpression':
      return [ast.subject, ast.expr];
    case 'FunctionCall':
      return ast.args || [];
    case 'Identifier':
      return ast.from ? [ast.from] : [];
    case 'ObjectLiteral':
      return Object.values(ast.value);
    case 'UnaryExpression':
      return [ast.right];
    default:
      return [];
  }
}

function collectRootIdentifiers(ast, identifiers = new Set()) {
  if (!ast || typeof ast !== 'object') return identifiers;

  if (ast.type === 'Identifier' && !ast.relative && !ast.from) {
    identifiers.add(ast.value);
  }

  for (const child of getNodeChildren(ast)) {
    collectRootIdentifiers(child, identifiers);
  }

  return identifiers;
}

function buildDependencyGraph(jexl, steps) {
  const stepNames = new Set(Object.keys(steps));
  const graph = {};

  for (const [name, expression] of Object.entries(steps)) {
    const ast = jexl.createExpression(expression).compile()._getAst();
    const identifiers = collectRootIdentifiers(ast);
    graph[name] = [...identifiers].filter((identifier) => stepNames.has(identifier));
  }

  return graph;
}

function topologicalSort(graph) {
  const order = [];
  const permanent = new Set();
  const temporary = new Set();

  function visit(node) {
    if (permanent.has(node)) return;
    if (temporary.has(node)) {
      throw new Error(`Dependencia ciclica detectada en ${node}`);
    }

    temporary.add(node);
    for (const dependency of graph[node] || []) {
      visit(dependency);
    }
    temporary.delete(node);
    permanent.add(node);
    order.push(node);
  }

  for (const node of Object.keys(graph)) {
    visit(node);
  }

  return order;
}

function createNamedStepEngine({ jexl, steps, finalStep }) {
  const dependencyGraph = buildDependencyGraph(jexl, steps);
  const evaluationOrder = topologicalSort(dependencyGraph);
  const compiledSteps = Object.fromEntries(
    Object.entries(steps).map(([name, expression]) => [
      name,
      jexl.createExpression(expression).compile(),
    ])
  );

  return {
    dependencyGraph,
    evaluationOrder,
    async evaluate(context = {}) {
      const stepResults = {};
      const executionLog = [];

      for (const stepName of evaluationOrder) {
        const scope = {
          ...context,
          ...stepResults,
        };
        const value = await compiledSteps[stepName].eval(scope);
        stepResults[stepName] = value;
        executionLog.push({
          step: stepName,
          expression: steps[stepName],
          dependsOn: dependencyGraph[stepName],
          value,
        });
      }

      if (!(finalStep in stepResults)) {
        throw new Error(`El paso final ${finalStep} no fue evaluado`);
      }

      return {
        finalStep,
        result: stepResults[finalStep],
        steps: executionLog,
        stepResults,
        dependencyGraph,
        evaluationOrder,
      };
    },
  };
}

function printEvaluation(result) {
  for (const step of result.steps) {
    console.log(
      `- ${step.step} = ${JSON.stringify(step.value)} | expr: ${step.expression} | deps: ${step.dependsOn.join(', ')}`
    );
  }
}

module.exports = {
  collectRootIdentifiers,
  buildDependencyGraph,
  topologicalSort,
  createNamedStepEngine,
  printEvaluation,
};
