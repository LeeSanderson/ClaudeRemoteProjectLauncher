'use strict';

const projects = require('./projects');
const launcher = require('./launcher');

module.exports = {
  ...projects,
  ...launcher,
};
