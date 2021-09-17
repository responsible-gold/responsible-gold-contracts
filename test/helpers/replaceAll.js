"use strict";
function replaceAll(input, find, replace) {
  return input.split(find).join(replace);
}

module.exports = replaceAll;