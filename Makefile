IMAGE_NAME = my-website
CONTAINER_NAME = my-website-app
PORT = 8080

.PHONY: help build stop run deploy pull logs

help:
	@echo "Available commands:"
	@echo "  make deploy  - Pulls latest code from git, builds the image, and restarts the container"
	@echo "  make build   - Builds the Docker image"
	@echo "  make stop    - Stops and removes the running container"
	@echo "  make run     - Runs the Docker container in the background"
	@echo "  make logs    - View the container logs"

deploy: pull build stop run
	@echo "Deployment complete! Application is running on port $(PORT)."

pull:
	git pull

build:
	docker build -t $(IMAGE_NAME) .

stop:
	-docker stop $(CONTAINER_NAME) 2>/dev/null || true
	-docker rm $(CONTAINER_NAME) 2>/dev/null || true

run:
	docker run -d \
		-p $(PORT):$(PORT) \
		-v $$(pwd)/papers.json:/app/papers.json \
		-v $$(pwd)/.env:/app/.env \
		--name $(CONTAINER_NAME) \
		--restart unless-stopped \
		$(IMAGE_NAME)

logs:
	docker logs -f $(CONTAINER_NAME)
