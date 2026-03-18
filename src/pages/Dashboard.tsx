/* Skeleton Loading */
.skeleton {
  background: linear-gradient(
    90deg,
    var(--gc-card) 25%,
    var(--gc-card-2) 50%,
    var(--gc-card) 75%
  );
  background-size: 200% 100%;
  animation: skeleton-loading 1.5s ease-in-out infinite;
  border-radius: var(--gc-radius-sm);
}

.skeleton-circle {
  background: linear-gradient(
    90deg,
    var(--gc-card) 25%,
    var(--gc-card-2) 50%,
    var(--gc-card) 75%
  );
  background-size: 200% 100%;
  animation: skeleton-loading 1.5s ease-in-out infinite;
}

@keyframes skeleton-loading {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
