import { say, str, classof } from './util.js';
import chld from 'child_process';
import ps from 'process';
import fs from 'fs';
import Path from 'path';
import util from 'util';

const ENV = ps.env;

class Conf {
  constructor() {
    this.values = {};
  }

  has(opt) {
    return Object.hasOwnProperty(this.values, opt);
  }

  get(opts, def) {
    if(Array.isArray(opts)) {
      let actual;
      for(let o of opts) actual = this.values[o] == undefined ? actual : this.values[o];
      return actual == undefined ? def : actual;
    }

    return this.values[opts] == undefined ? def : this.values[opts];
  }

  set(key, value) {
    this.values[key] = value;
  }
}

function toConfig(opts, conf, rest) {
  conf ||= new Conf;
  rest ||= [];

  let doneParsing = false;

  for(const opt of opts) {
    if(doneParsing) {
      rest.push(opt);
      continue;
    }

    if(typeof opt == 'string') {
      if(opt == '--') {
        doneParsing = true;
        continue;
      }

      if(opt[0] == '-') {
        if(opt[1] == '-') {
          conf.set(opt.substr(2), true);
        } else {
          for(const single of opt.substr(1).split(""))
            conf.set(single, true);
        }
      } else {
        rest.push(opt);
      }
    } else if(!Array.isArray(opt) && typeof opt == 'object') {
      for(const key of Object.keys(opt)) {
        conf.set(key, opt[key]);
      }
    } else {
      rest.push(opt);
    }
  }

  return [conf, rest];
}

function mkOptFun(f) {
  return function(...opts) {
    const [c, args] = toConfig(opts);
    return f(c, ...args);
  }
}

function direxpand(path) {
  if(path[0] == '~')
    return Path.join(ENV['HOME'], path.substr(1));

  return path;
}

const Fns = {
  basename(c, path, ext) {
    return Path.basename(path, ext);
  },

  cd(c, path) {
    return ps.chdir(direxpand(path));
  },

  chmod(c, mode, path) {
    return fs.chmodSync(direxpand(path), mode);
  },

  cp(c, src, dest) {
    src = direxpand(src);
    dest = direxpand(dest);

    if(sh.isDir(dest))
      dest = Path.join(dest, sh.basename(src));

    return fs.cpSync(src, dest);
  },

  echo(...args) {
    say(...args);
  },

  exists(c, path) {
    const doFollow = c.get(["f", "follow"]);
    path = direxpand(path);

    let stat = doFollow ? fs.statSync(path, { throwIfNoEntry: false }) : fs.lstatSync(path, { throwIfNoEntry: false });
    return (stat != null)
  },

  isDir(c, path) {
    path = direxpand(path);

    const stat = fs.statSync(path, { throwIfNoEntry: false });

    return stat && stat.isDirectory();
  },

  ln(c, src, dest) {
    src = direxpand(src);
    dest = direxpand(dest);

    if(sh.isDir(dest))
      dest = Path.join(dest, sh.basename(src));

    const isSymlink = c.get(["s", "symbolic"]);
    const doForce = c.get(["f", "force"]);

    if(doForce) {
      sh.rm("-f", dest);
    }

    if(isSymlink)
      return fs.symlinkSync(src, dest);
    else
      return fs.linkSync(src, dest)

    throw `Not implemented: ln ${c}`
  },

  ls(c, ...args) {
    // fixme: actually split into functions etc
    const asMap = c.get(['m', 'map']);
    const doStat = c.get(['l']);
    const doSort = c.get(['s', 'sort']) && !asMap;

    let r = asMap ? {} : [];

    for(const cpath of args) {
      const path = direxpand(cpath);
      const thismap = asMap ? {} : null;

      if(asMap) {
        r[path] = thismap;
      }

      const dir = fs.opendirSync(path);
      let ent;

      while(ent = dir.readSync()) {
        const fullpath = Path.join(path, ent.name);
        let stat;

        if(doStat) {
          stat = fs.lstatSync(fullpath);
          stat.fullpath = fullpath;
        }

        if(asMap) {
          thismap[ent.name] = doStat ? stat : fullpath;
        } else {
          r.push(doStat ? stat : fullpath);
        }
      }

      dir.closeSync();
    }

    if(doSort) {
      if(doStat)
        r.sort((a,b) => { return a.fullpath.localeCompare(b.fullpath); });
      else
        r.sort();
    }

    return r;
  },

  mkdir(c, path) {
    const recursive = c.get(["r", "p", "recursive", "parents"]);
    return fs.mkdirSync(direxpand(path), { recursive: recursive });
  },

  mv(c, src, dest) {
    src = direxpand(src);
    dest = direxpand(dest);

    if(sh.isDir(dest))
      dest = Path.join(dest, sh.basename(src));

    return fs.renameSync(src, dest);
  },

  realpath(c, path) {
    return fs.realpathSync(direxpand(path));
  },

  rm(c, ...files) {
    const force = c.get(["f", "force"]);
    const recursive = c.get(["r", "recursive"]);

    for(const cpath of files) {
      const path = direxpand(cpath);
      let stat = fs.lstatSync(path, { throwIfNoEntry: false });
      if(!stat) {
        if(force) continue;
        throw `rm: file not found: ${path}`;
      }

      if(stat.isSymbolicLink()) {
        fs.unlinkSync(path);
      } else {
        fs.rmSync(path, { force: force, recursive: recursive });
      }
    }
  },

  rmdir(c, ...dirs) {
    const force = c.get(["f", "force"]);

    for(const dir of dirs) {
      if(force && !sh.exists(dir)) continue;
      fs.rmdirSync(dir);
    }
  },

  write(c, path, data) {
    return fs.writeFileSync(direxpand(path), data);
  },
}

function interpToStr(strs, interp) {
  let arr = [];
  strs.forEach((str, i) => {
    arr.push(str, interp[i]);
  });
  return arr.join('');
}

function $(strs, ...interp) {
  const cmd = interpToStr(strs, interp);

  if($.echo) sh.echo(cmd);
  chld.execSync(cmd, { stdio: 'inherit' });
}
$.echo = true;

function $$(strs, ...interp) {
  const cmd = interpToStr(strs, interp);
  const rc = chld.spawnSync(cmd, { shell: true });

  if(!rc.status && rc.signal == null) {
    let s = rc.stdout.toString();
    if($$.trimLastNL && s.endsWith("\n"))
      return s.replace(/\n$/, "");

    return s;
  }

  let err = rc.status ? `returned ${rc.status}` : `signal ${rc.signal}`;
  throw `${cmd}: ${err}:\n${rc.stderr.toString()}`;
}
$$.trimLastNL = true;

const sh = {};

// These are _excluded_ from taking any options
const OptExceptions = {
  "echo": true,
}

for(const k of Object.keys(Fns)) {
  if(!OptExceptions[k])
    sh[k] = mkOptFun(Fns[k]);
  else
    sh[k] = Fns[k];
}

const __ = "--";

export { sh, $, $$, __ };
