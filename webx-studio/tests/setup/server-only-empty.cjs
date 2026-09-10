// The real stand-in module for "server-only" during tests — see
// register.mjs's comment for why. A real (not virtual) file on disk so
// Node's own CJS Module._extensions loader can load it completely normally
// once resolution is redirected to it.
module.exports = {};
