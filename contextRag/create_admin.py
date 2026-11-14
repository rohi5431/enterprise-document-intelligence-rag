
from getpass import getpass

from app.db.session import SessionLocal
from app.models.user import User, UserRole
from app.core.security import hash_password

db = SessionLocal()

try:
    existing_count = db.query(User).count()

    if existing_count != 0:
        print("ABORTED: Database is not empty.")
        raise SystemExit(1)

    email = input("Enter admin email: ").strip().lower()
    password = getpass("Enter admin password: ")
    confirm = getpass("Confirm admin password: ")

    if not email or "@" not in email:
        raise ValueError("Invalid email address.")

    if len(password) < 8 or len(password) > 128:
        raise ValueError("Password must be 8-128 characters.")

    if password != confirm:
        raise ValueError("Passwords do not match.")

    admin = User(
        email=email,
        hashed_password=hash_password(password),
        full_name="ContextRag Administrator",
        role=UserRole.ADMIN,
        is_active=True,
        is_verified=True,
    )

    db.add(admin)
    db.commit()
    db.refresh(admin)

    print("\nAdmin account created successfully!")
    print("Admin ID:", admin.id)
    print("Admin email:", admin.email)
    print("Admin role:", admin.role.value)

except SystemExit:
    db.rollback()
    raise

except Exception as exc:
    db.rollback()
    print("Admin creation failed:", type(exc).__name__, str(exc))
    raise

finally:
    db.close()
