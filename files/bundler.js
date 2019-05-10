const { manifest } = require('./manifest');

module.exports = manifest.reduce((ops, obj) => {
  const doc = require(`./${obj}.graphql`);
  return {
    ...ops,
    [obj]: doc,
  };
}, {});
