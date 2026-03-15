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

function assignTraceIds(ast, idFactory = (() => {
  let counter = 0;
  return () => `n${++counter}`;
})()) {
  if (!ast || typeof ast !== 'object') return ast;

  if (!Object.prototype.hasOwnProperty.call(ast, '__traceId')) {
    Object.defineProperty(ast, '__traceId', {
      value: idFactory(),
      enumerable: false,
    });
  }

  for (const child of getNodeChildren(ast)) {
    assignTraceIds(child, idFactory);
  }

  return ast;
}

function getPrecedence(ast, grammar) {
  if (!ast) return Number.POSITIVE_INFINITY;
  if (ast.type === 'BinaryExpression') {
    return grammar.elements[ast.operator].precedence || 0;
  }
  if (ast.type === 'ConditionalExpression') {
    return -1;
  }
  return Number.POSITIVE_INFINITY;
}

function wrapIfNeeded(ast, grammar, rendered, parentPrecedence) {
  const childPrecedence = getPrecedence(ast, grammar);
  if (childPrecedence < parentPrecedence) {
    return `(${rendered})`;
  }
  return rendered;
}

function renderLiteral(value) {
  return typeof value === 'string' ? JSON.stringify(value) : String(value);
}

function renderAst(ast, grammar) {
  switch (ast.type) {
    case 'ArrayLiteral':
      return `[${ast.value.map((node) => renderAst(node, grammar)).join(', ')}]`;
    case 'BinaryExpression': {
      const precedence = getPrecedence(ast, grammar);
      const left = wrapIfNeeded(ast.left, grammar, renderAst(ast.left, grammar), precedence);
      const right = wrapIfNeeded(ast.right, grammar, renderAst(ast.right, grammar), precedence);
      return `${left} ${ast.operator} ${right}`;
    }
    case 'ConditionalExpression':
      return `${renderAst(ast.test, grammar)} ? ${renderAst(ast.consequent, grammar)} : ${renderAst(ast.alternate, grammar)}`;
    case 'FilterExpression':
      return `${renderAst(ast.subject, grammar)}[${renderAst(ast.expr, grammar)}]`;
    case 'FunctionCall': {
      const renderedArgs = (ast.args || []).map((arg) => renderAst(arg, grammar));
      if (ast.pool === 'transforms') {
        const [subject, ...rest] = renderedArgs;
        return `${subject}|${ast.name}(${rest.join(', ')})`;
      }
      return `${ast.name}(${renderedArgs.join(', ')})`;
    }
    case 'Identifier':
      if (ast.from) {
        return `${renderAst(ast.from, grammar)}.${ast.value}`;
      }
      return ast.relative ? `.${ast.value}` : ast.value;
    case 'Literal':
      return renderLiteral(ast.value);
    case 'ObjectLiteral':
      return `{ ${Object.entries(ast.value)
        .map(([key, value]) => `${key}: ${renderAst(value, grammar)}`)
        .join(', ')} }`;
    case 'UnaryExpression':
      return `${ast.operator}${renderAst(ast.right, grammar)}`;
    default:
      throw new Error(`Tipo de AST no soportado: ${ast.type}`);
  }
}

function flattenTrace(trace, result = []) {
  result.push({
    id: trace.id,
    type: trace.type,
    label: trace.label,
    value: trace.value,
    shortCircuited: trace.shortCircuited || false,
  });

  for (const child of trace.children || []) {
    flattenTrace(child, result);
  }

  for (const iteration of trace.iterations || []) {
    flattenTrace(iteration.predicate, result);
  }

  return result;
}

async function evaluateIdentifier(ast, state, trace) {
  if (!ast.from) {
    const source = ast.relative ? state.relativeContext : state.context;
    return source == null ? undefined : source[ast.value];
  }

  const fromResult = await evaluateNode(ast.from, state);
  trace.children.push(fromResult.trace);

  let container = fromResult.value;
  if (container === undefined || container === null) {
    return undefined;
  }
  if (Array.isArray(container)) {
    container = container[0];
  }
  return container[ast.value];
}

async function evaluateFunctionCall(ast, state, trace) {
  const pool = state.grammar[ast.pool];
  const fn = pool[ast.name];

  if (!fn) {
    throw new Error(`No existe ${ast.pool}.${ast.name}`);
  }

  const argValues = [];
  for (const argAst of ast.args || []) {
    const argResult = await evaluateNode(argAst, state);
    trace.children.push(argResult.trace);
    argValues.push(argResult.value);
  }

  return fn(...argValues);
}

async function evaluateFilterExpression(ast, state, trace) {
  const subjectResult = await evaluateNode(ast.subject, state);
  trace.children.push(subjectResult.trace);

  if (ast.relative) {
    const subject = Array.isArray(subjectResult.value)
      ? subjectResult.value
      : subjectResult.value === undefined
        ? []
        : [subjectResult.value];

    const filtered = [];
    trace.iterations = [];

    for (let index = 0; index < subject.length; index += 1) {
      const item = subject[index];
      const predicateResult = await evaluateNode(ast.expr, {
        ...state,
        relativeContext: item,
      });

      const passed = Boolean(predicateResult.value);
      trace.iterations.push({
        index,
        item,
        passed,
        predicate: predicateResult.trace,
      });

      if (passed) {
        filtered.push(item);
      }
    }

    return filtered;
  }

  const exprResult = await evaluateNode(ast.expr, state);
  trace.children.push(exprResult.trace);

  if (typeof exprResult.value === 'boolean') {
    return exprResult.value ? subjectResult.value : undefined;
  }

  return subjectResult.value?.[exprResult.value];
}

async function evaluateBinaryExpression(ast, state, trace) {
  const operator = state.grammar.elements[ast.operator];

  if (operator.evalOnDemand) {
    const evaluated = new Map();
    const wrap = (name, childAst) => ({
      eval: async () => {
        const childResult = await evaluateNode(childAst, state);
        trace.children.push(childResult.trace);
        evaluated.set(name, childResult);
        return childResult.value;
      },
    });

    const value = await operator.evalOnDemand(
      wrap('left', ast.left),
      wrap('right', ast.right)
    );

    if (!evaluated.has('right')) {
      trace.shortCircuited = true;
    }

    return value;
  }

  const leftResult = await evaluateNode(ast.left, state);
  const rightResult = await evaluateNode(ast.right, state);
  trace.children.push(leftResult.trace, rightResult.trace);
  return operator.eval(leftResult.value, rightResult.value);
}

async function evaluateNode(ast, state) {
  const trace = {
    id: ast.__traceId,
    type: ast.type,
    label: renderAst(ast, state.grammar),
    children: [],
  };

  let value;
  switch (ast.type) {
    case 'ArrayLiteral': {
      const items = [];
      for (const itemAst of ast.value) {
        const itemResult = await evaluateNode(itemAst, state);
        trace.children.push(itemResult.trace);
        items.push(itemResult.value);
      }
      value = items;
      break;
    }
    case 'BinaryExpression':
      value = await evaluateBinaryExpression(ast, state, trace);
      break;
    case 'ConditionalExpression': {
      const testResult = await evaluateNode(ast.test, state);
      trace.children.push(testResult.trace);
      if (testResult.value) {
        const consequentResult = await evaluateNode(ast.consequent, state);
        trace.children.push(consequentResult.trace);
        value = consequentResult.value;
      } else {
        const alternateResult = await evaluateNode(ast.alternate, state);
        trace.children.push(alternateResult.trace);
        value = alternateResult.value;
      }
      break;
    }
    case 'FilterExpression':
      value = await evaluateFilterExpression(ast, state, trace);
      break;
    case 'FunctionCall':
      value = await evaluateFunctionCall(ast, state, trace);
      break;
    case 'Identifier':
      value = await evaluateIdentifier(ast, state, trace);
      break;
    case 'Literal':
      value = ast.value;
      break;
    case 'ObjectLiteral': {
      const objectValue = {};
      for (const [key, valueAst] of Object.entries(ast.value)) {
        const fieldResult = await evaluateNode(valueAst, state);
        trace.children.push(fieldResult.trace);
        objectValue[key] = fieldResult.value;
      }
      value = objectValue;
      break;
    }
    case 'UnaryExpression': {
      const rightResult = await evaluateNode(ast.right, state);
      trace.children.push(rightResult.trace);
      value = state.grammar.elements[ast.operator].eval(rightResult.value);
      break;
    }
    default:
      throw new Error(`Tipo de AST no soportado: ${ast.type}`);
  }

  trace.value = value;
  return { value, trace };
}

async function traceExpression({ jexl, expression, context = {} }) {
  const compiled = jexl.createExpression(expression).compile();
  const ast = assignTraceIds(compiled._getAst());
  const result = await evaluateNode(ast, {
    grammar: jexl._grammar,
    context,
    relativeContext: context,
  });

  return {
    expression,
    result: result.value,
    ast,
    trace: result.trace,
    flatTrace: flattenTrace(result.trace),
  };
}

function printTrace(trace, indent = 0) {
  const prefix = ' '.repeat(indent);
  const suffix = trace.shortCircuited ? ' [short-circuit]' : '';
  console.log(
    `${prefix}- ${trace.type} :: ${trace.label} => ${JSON.stringify(trace.value)}${suffix}`
  );

  for (const child of trace.children || []) {
    printTrace(child, indent + 2);
  }

  for (const iteration of trace.iterations || []) {
    console.log(
      `${prefix}  * filtro[${iteration.index}] => passed=${iteration.passed} item=${JSON.stringify(iteration.item)}`
    );
    printTrace(iteration.predicate, indent + 4);
  }
}

module.exports = {
  assignTraceIds,
  renderAst,
  traceExpression,
  flattenTrace,
  printTrace,
};
