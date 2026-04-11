# from composio import Composio
# from langchain.agents import create_agent
# from langchain_openai.chat_models import ChatOpenAI
# from app.config import get_settings

# settings = get_settings()
# # Initialize Composio
# composio = Composio(api_key=settings.composio_api_key)

# external_user_id = "pg-test-602ded4f-31a2-4258-a054-6c61138f16f2"

# # Create a tool router session
# session = composio.create(
#     user_id=external_user_id,
# )

# # Get tools from the session (native)
# tools = session.tools()

# # Initialize LangChain model
# model = ChatOpenAI(model="gpt-5.4", api_key=settings.openai_api_key)

# # Create agent
# agent = create_agent(
#     tools=tools,
#     model=model,
# )

# # Run the agent
# result = agent.invoke(
#     {
#         "messages": [
#             {
#                 "role": "user",
#                 "content": "Send an email to julien.wut@gmail.com with the subject 'Hello from Composio' and the body 'This is a test email!'",
#             }
#         ]
#     }
# )

# print("✅ Email sent successfully!")
# print(result)

