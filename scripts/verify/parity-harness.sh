#!/usr/bin/env bash

install_parity_harness() {
  local src=$1
  cp -R test/parity "$src/test/"
  cp test/workerCap.mjs "$src/test/workerCap.mjs"
}
