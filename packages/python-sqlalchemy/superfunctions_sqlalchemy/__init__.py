"""
SQLAlchemy adapter for superfunctions.db

Example:
    >>> from sqlalchemy import create_engine
    >>> from superfunctions_sqlalchemy import create_adapter
    >>> 
    >>> engine = create_engine("postgresql://localhost/mydb")
    >>> adapter = create_adapter(engine)
    >>> 
    >>> # Use with any superfunctions library
    >>> from authfn import create_authfn, AuthFnConfig
    >>> auth = create_authfn(AuthFnConfig(database=adapter))
"""

from .adapter import SQLAlchemyAdapter, create_adapter

__version__ = "0.1.0"
__all__ = ["SQLAlchemyAdapter", "create_adapter"]
