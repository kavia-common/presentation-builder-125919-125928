#!/bin/bash
cd /home/kavia/workspace/code-generation/presentation-builder-125919-125928/pdf_to_ppt_frontend
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi

