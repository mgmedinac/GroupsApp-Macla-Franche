# gRPC Kubernetes manifests

Apply after namespace and base secret exist:

```bash
kubectl apply -f grpc/k8s/user-grpc.yaml
kubectl apply -f grpc/k8s/chat-grpc.yaml
```

These services communicate internally through ClusterIP DNS:

- `user-grpc.groupsapp.svc.cluster.local:50051`
- `chat-grpc.groupsapp.svc.cluster.local:50052`
