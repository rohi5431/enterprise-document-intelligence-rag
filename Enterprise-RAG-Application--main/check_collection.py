from qdrant_client import QdrantClient

client = QdrantClient(
    url="https://a6ad705b-6952-4696-af59-88b78193e7b0.eu-west-1-0.aws.cloud.qdrant.io",
    api_key="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY2Nlc3MiOiJtIiwic3ViamVjdCI6ImFwaS1rZXk6YmRhODQwM2MtZTQ4OC00ZjY0LWI5NDUtYzZmMTg0ZTg3NzM2In0.Ec0_cnS4QrjLZO3d4Ur2RDmRkIiAbSgk6VsmCuZeVxs"
)

info = client.get_collection("rag_application")

print(info)