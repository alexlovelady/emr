# infra/terraform

Deferred — see [ADR-0001](../../docs/adr/0001-railway-hosting.md).

Phase 1 hosts on Railway (manual setup, see [docs/deploy/railway.md](../../docs/deploy/railway.md)),
not AWS. Terraform-managed AWS infrastructure (accounts, ECS/Fargate, VPC, KMS, etc. — spec
§2.1/§2.2) returns once Phase 0's AWS account/BAA work is complete and a real pilot requires
production PHI.
