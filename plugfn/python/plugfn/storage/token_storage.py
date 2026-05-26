"""Secure token storage with encryption."""

from cryptography.fernet import Fernet
import base64
import hashlib


class SecureTokenStorage:
    """Encrypts and decrypts credentials using Fernet symmetric encryption."""

    def __init__(self, encryption_key: str):
        """Initialize secure token storage.

        Args:
            encryption_key: 32-character encryption key

        Raises:
            ValueError: If encryption key is invalid
        """
        # Derive a proper Fernet key from the encryption key
        key_bytes = encryption_key.encode("utf-8")
        
        # Ensure we have exactly 32 bytes by hashing
        if len(key_bytes) != 32:
            key_bytes = hashlib.sha256(key_bytes).digest()
        
        # Convert to base64 for Fernet
        fernet_key = base64.urlsafe_b64encode(key_bytes)
        
        self.cipher = Fernet(fernet_key)

    def encrypt(self, data: str) -> str:
        """Encrypt data.

        Args:
            data: Data to encrypt

        Returns:
            Encrypted data as string
        """
        encrypted = self.cipher.encrypt(data.encode("utf-8"))
        return encrypted.decode("utf-8")

    def decrypt(self, encrypted_data: str) -> str:
        """Decrypt data.

        Args:
            encrypted_data: Encrypted data

        Returns:
            Decrypted data

        Raises:
            Exception: If decryption fails
        """
        decrypted = self.cipher.decrypt(encrypted_data.encode("utf-8"))
        return decrypted.decode("utf-8")
