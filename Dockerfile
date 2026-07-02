FROM python:3.11-slim

# Prevent Python from buffering stdout and stderr logs
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Create a non-root user
RUN useradd -m appuser

COPY . /app

# Change ownership of the app directory to the new user so they can write to papers.json
RUN chown -R appuser:appuser /app

# Switch to the non-root user
USER appuser

EXPOSE 8080

CMD ["python3", "server.py"]
