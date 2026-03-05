# Merchant Demo Client

This directory contains a minimal merchant-side demo.

Responsibilities:

- create handshake request
- display request as QR
- accept visa token from wallet
- verify visa token via server

The merchant client does not perform cryptographic verification
locally in this MVP. Verification is delegated to the server.