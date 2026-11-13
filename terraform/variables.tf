variable "aws_region" {
  description = "AWS deployment region"
  type        = string
  default     = "ap-northeast-1"
}

variable "ami_id" {
  description = "Ubuntu 24.04 LTS amd64 in ap-northeast-1, published 2026-10-23. This account cannot look up AMIs."
  type        = string
  default     = "ami-09123d7cb03420818"
}
