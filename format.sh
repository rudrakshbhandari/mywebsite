#!/bin/bash

set -e

echo "Formatting repository with Prettier..."
npx prettier --write .
