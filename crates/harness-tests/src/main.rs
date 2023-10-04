use std::collections::HashMap;

use harness::{Client, Monolith, TestRunner, WebsocketSender};
use ott_balancer_protocol::client::*;
use test_context::test_context;

#[test_context(TestRunner)]
#[tokio::test]
async fn sample_test(ctx: &mut TestRunner) {
    let mut m = Monolith::new(ctx).await.unwrap();
    println!("monolith port: {}", m.port());
    assert_ne!(m.port(), 0);
    m.show().await;

    let mut c = Client::new(ctx).unwrap();
    c.join("foo").await;

    m.wait_recv().await;

    let recvd = m.collect_recv();
    assert_eq!(recvd.len(), 1);

    assert!(c.connected());
    let msg = ClientMessageOther {
        action: "chat".to_owned(),
        extra: HashMap::from([("message".to_owned(), "hello".into())]),
    };
    c.send(msg).await;

    m.wait_recv().await;
    let recvd = m.collect_recv();
    assert_eq!(recvd.len(), 2);
}

/// Add and remove a monolith a bunch of times to make sure that monolith discovery works.
#[test_context(TestRunner)]
#[tokio::test]
async fn discovery_add_remove(ctx: &mut TestRunner) {
    let mut m = Monolith::new(ctx).await.unwrap();
    println!("monolith port: {}", m.port());
    assert_ne!(m.port(), 0);

    for _ in 0..10 {
        m.show().await;
        assert!(m.connected());
        m.hide().await;
        assert!(!m.connected());
    }
}

fn main() {}