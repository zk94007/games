/* eslint-disable brace-style, camelcase, semi */

exports.get_new_die = function get_new_die () {
  return (Math.floor(Math.random() * (6 - 1 + 1)) + 1);
};
