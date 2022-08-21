# shellscript.js

This is a (very early but working) "shell script but using node" package.  This borrows ideas from things like [zx](https://github.com/google/zx), but is targeted at writing the most succinct code.

```js
import { sh, $, $$ } from 'shellscript';

for(const ent of sh.ls("-l", "/")) {
   // -l returns lstat results with the full path
   console.log(ent.fullpath, "is", ent.size, "bytes");
}

// Run interactively / show output
$`git diff`

// Get string
const path = $$`git rev-parse --show-toplevel`;
```

## Why?

This is likely an "if you have to ask..." then probably it's not your problem: you don't have need to conveniently write lots of filesystem-manipulation and shell command calls.  Node already has facilities in `fs`, `process`, etc, many of which are simple wrapped here.

The goal is _maximum convenience_ and _directness_.  If you write shell scripts, it's likely because trivial `cd` and `mkdir` and `if [ -e .. ]` and `cp`/`rm`/etc and command-calling are the things you mostly need.  Also potentially portability (everyone has bash).

Of course, everything _beyond_ that tends to suffer in shell: real functions, data structures, even simple textual substitutions start being hacks (e.g. pipe to sed or awk, deal with proper escaping, deal with `IFS` or bash arrays/maps/etc).

Node has everything: it's very portable, many of the functions are already there, there is proper structured data and functions, etc.  _shellscript.js_ is simply the final bridge to "doing shell things" with minimal resistance.  This means this is a **synchronous** API (with some potential exceptions).  If you need _async_, node _already_ provides a relatively succinct API for this.


## Core concept

Right now there are two basic things:

  * `sh`: A host of "commands" meant to mimic shell-like convenience
  * `$`, `$$`: Run commands and show output or get the result string

"Commands" take "options" and "regular" arguments as follows:

  * `-...`: a single dash followed by non-dash characters specify "short" options, e.g. `-lr` is `{ l: true, r: true }`
  * `--...`: double-dash argument becomes a long option: `--long` is `{ long: true }`
  * `{ option: value, ... }`: Objects are combined as options, `sh.cmd("-l", { x: 42 })` is `{ l: true, x: 42 }`
  * `--`: Double-dash stops parsing all following arguments as options, and passes them as regular
  * Everything else: passed as a regular argument

This behaves in a vaguely shell-like manner:

```js
sh.cmd("-lr", "-x", "--verbose", 37, { width: 42 }, "/")

// options: { l: true, r: true, x: true, verbose: true, width: 42 }
// args:    [ 37, "/" ]

sh.cmd("-v", "--", "-h")

// options: { v: true }
// args:    [ "-h" ]
```

You may also import `__`, which is bound to the string `"--"`, and use that, if it's convenient: `sh.cmd("-x", __, "-y")`

Currently arguments are not _validated_.


## `$` and `$$`

These are template-string tags which call the shell.  That is, you type ``$`command...` `` and it calls the shell with that command.  There are two variations:

  * `$`: Run and show the command (if `$.echo = true`, default) and its output (in any case)
  * `$$`: Run and return the string from `stdout`.  Trim the final newline (if `$$.trimFinalNL = true`, default).  Throw an error with the error code or signal, and `stderr` output, if an error/signal occurs.

(More options are likely to be added, but the goal of these is the "common 95%", not necessarily handling every possible permutation... we already have functions in `process` for specific needs!)

## Commands

These try to mimic shell commands in many ways.  The goal is to provide common _useful_ functionality in the most convenient and accessible package, addressing the "common 95%" of cases.  Of course, you could simply use ``$`...` `` for everything, but these often provide _structured data_ rather than strings.

The goal is _not_ to provide a 1:1 mapping to shellutils, or to do everything shell commands do.  The goal is not to behave precisely _like_ shell commands.  Some options may differ.  Many are simple wrappers around `PKG.fooSync()` that are simply in-one-place and more convenient to write.

  * `cd(PATH)`: `chdir` to the specified path
  * `chmod(MODE, PATH)`: Change file modes; note the parameter order is like shell chmod, and reversed from `ps.chmod`
  * `cp(SRC, DEST)`: Copy source file to destination
  * `echo(...VALS)`: Print strings normally, or objects using util.inspect
    - Takes **no option arguments**; you do not have to use "--" and objects or `-...` forms will not be consumed as options
  * `exists(PATH)`:  Return true if `PATH` exists; this does _not_ follow/validate symlinks by default
    - `-f`, `--follow`: Follow symlinks; this will return false if there is a symlink, but it points to a nonexistent file
  * `ln(SRC, DEST)`: Link SRC to DEST; hard link by default
    - `-s`, `--symlink`: Symlink
    - `-f`, `--force`: `rm -f DEST` first
  * `ls(...PATHS)`: Produce a list (or map, with `-m`) of paths; this is fullpath strings by default
    - `-l`: Produce `lstat` results, with an additional `fullpath`, instead of simple strings
    - `-m`, `--map`: Produce a map in the form `{ "/dir": { "file": "/dir/file"}, ... }`; if `-l` is specified, the form is `{ "/dir": { "file": Stats { ..., fullpath: "/dir/file" } } }` instead
    - `-s`: Sort results; this does not apply to map results
  * `mkdir(PATH)`: Create `PATH`
    - `-p`, `--parents`, `-r`, `--recursive`:  Create directories recursively as necessary
  * `mv(SRC, DEST)`: Rename/move `SRC` to `DEST`
  * `realpath(PATH)`: Return the `realpath` of `PATH`
  * `rm(...FILES)`: Delete `FILE`; behaves more like `/bin/rm`, i.e. unlike `fs.rm()` deletes the _symlink_ not the _dereferenced file_.
    - `-f`: Don't complain if the file doesn't exist
  * `rmdir(...DIRS)`: `rmdir` each directory
    - `-f`: Don't complain if the directory doesn't exist
  * `write(PATH, DATA)`: Write `DATA` to `PATH`; just `fs.writeFileSync`
