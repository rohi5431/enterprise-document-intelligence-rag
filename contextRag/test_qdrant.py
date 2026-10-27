# # from qdrant_client import QdrantClient
# # from app.core.config import settings

# # client = QdrantClient(
# #     url=settings.QDRANT_URL,
# #     api_key=settings.QDRANT_API_KEY
# # )

# # print("COLLECTIONS:")
# # print(client.get_collections())

# # print("\nPOINT COUNT:")

# # print(
# #     client.count(
# #         collection_name=settings.QDRANT_COLLECTION_NAME,
# #         exact=True
# #     )
# # )

# from qdrant_client import QdrantClient

# client = QdrantClient(
#     url="https://a6ad705b-6952-4696-af59-88b78193e7b0.eu-west-1-0.aws.cloud.qdrant.io",
#     api_key="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY2Nlc3MiOiJtIiwic3ViamVjdCI6ImFwaS1rZXk6YmRhODQwM2MtZTQ4OC00ZjY0LWI5NDUtYzZmMTg0ZTg3NzM2In0.Ec0_cnS4QrjLZO3d4Ur2RDmRkIiAbSgk6VsmCuZeVxs"
# )

# print(client.get_collection("rag_application"))

from qdrant_client import QdrantClient

client = QdrantClient(
    url="https://a6ad705b-6952-4696-af59-88b78193e7b0.eu-west-1-0.aws.cloud.qdrant.io",
    api_key="YOUR_API_KEY"
)

collection = "rag_application"

print("\n===== COLLECTION INFO =====")
print(client.get_collection(collection))

print("\n===== VECTOR COUNT =====")
count = client.count(
    collection_name=collection,
    exact=True
)

print(count)

