FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY medtime ./medtime
COPY prompts ./prompts
COPY typesystem ./typesystem
COPY server.py ./

EXPOSE 8000

# the API key comes from the GEMINI_API_KEY environment variable (see compose.yaml)
CMD ["python", "server.py", "--host", "0.0.0.0", "--port", "8000", "--cache", "/cache/answers.jsonl"]
