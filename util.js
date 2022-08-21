import util from 'util';

function toStr(x) {
  if (typeof x == 'string' || typeof x == 'number') {
    return x.toString();
  }

  return util.inspect(x);
}

function str(...s) {
  return s.map(toStr).join('');
}

function say(...s) {
  console.log(str(...s));
}

function classof(o) {
  return o.constructor;
}

export { say, str, classof };
