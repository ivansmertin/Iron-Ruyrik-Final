class DomainError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400):
        self.code = code
        self.message = message
        self.status_code = status_code
        super().__init__(message)


def not_found(message: str = "Объект не найден") -> DomainError:
    return DomainError("NOT_FOUND", message, 404)

