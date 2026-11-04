// productionContainer.ts lazy-loads infrastructure with import(), which Jest
// cannot run without --experimental-vm-modules. Release tests only: rewrite
// import(x) to Promise.resolve().then(() => require(x)).
module.exports = function dynamicImportToRequire({ types: t }) {
  return {
    visitor: {
      CallExpression(path) {
        if (path.node.callee.type !== 'Import') return;
        const resolved = t.callExpression(t.memberExpression(t.identifier('Promise'), t.identifier('resolve')), []);
        const load = t.arrowFunctionExpression([], t.callExpression(t.identifier('require'), path.node.arguments));
        path.replaceWith(t.callExpression(t.memberExpression(resolved, t.identifier('then')), [load]));
      },
    },
  };
};
